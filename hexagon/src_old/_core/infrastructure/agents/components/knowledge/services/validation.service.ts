import { Injectable, Inject } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';
import { getErrorInfo } from '@common/error-assertions';
import { KnowledgeGraphService } from './knowledge-graph.service';
import {
  ValidationResult,
  ValidationIssue,
  ValidationConfig,
  ValidationCheckType,
  ValidationSeverity,
  ValidateExpertWorkRequest,
  BatchValidationRequest,
  BatchValidationResult,
  ValidationStatistics,
  SourceVerificationResult,
} from '../types/validation.types';
import { ExpertReport } from '../types/expert-pool.types';
import { KnowledgeNode } from '../entities/knowledge-node.entity';
import axios from 'axios';

/**
 * Validation Service
 * 
 * Reviews Expert Agent work for quality, accuracy, and consistency.
 * Performs multiple validation checks:
 * - Hallucination detection
 * - Source verification
 * - Fact consistency
 * - Duplicate detection
 * - Relationship validity
 * - Category consistency
 * 
 * Can delegate complex SKIN phase validation to ValidationAgent.
 */
@Injectable()
export class ValidationService {
  private config: ValidationConfig;
  private validationHistory: ValidationResult[] = [];
  private readonly maxHistorySize = 1000;

  constructor(
    @Inject(KnowledgeGraphService)
    private readonly knowledgeGraph: KnowledgeGraphService,
    @Inject(MyLogger) private readonly logger: MyLogger,
  ) {
    // Default configuration
    this.config = {
      enabledChecks: [
        ValidationCheckType.HALLUCINATION_DETECTION,
        ValidationCheckType.SOURCE_VERIFICATION,
        ValidationCheckType.FACT_CONSISTENCY,
        ValidationCheckType.DUPLICATE_DETECTION,
        ValidationCheckType.RELATIONSHIP_VALIDITY,
        ValidationCheckType.CATEGORY_CONSISTENCY,
      ],
      minConfidenceThreshold: 0.7,
      autoFixEnabled: false,
      blockingSeverity: ValidationSeverity.ERROR,
      useSkinValidationAgent: false,
      timeout: 5 * 60 * 1000, // 5 minutes
    };

    this.logger.info('ValidationService initialized', ValidationService.name);
  }

  /**
   * Update validation configuration
   */
  updateConfig(config: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Validation config updated', ValidationService.name);
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config };
  }

  // ========================================
  // Main Validation Entry Points
  // ========================================

  /**
   * Validate expert work from a report
   */
  async validateExpertWork(request: ValidateExpertWorkRequest): Promise<ValidationResult> {
    const startTime = new Date();
    const { expertReport, config, applyFixes } = request;

    // Merge config
    const effectiveConfig = config ? { ...this.config, ...config } : this.config;

    this.logger.info(
      `Validating expert ${expertReport.expertId} work`,
      ValidationService.name,
    );

    const issues: ValidationIssue[] = [];

    // Run enabled checks
    for (const checkType of effectiveConfig.enabledChecks) {
      try {
        const checkIssues = await this.runCheck(checkType, expertReport, effectiveConfig);
        issues.push(...checkIssues);
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Validation check ${checkType} failed: ${info.message}`,
          ValidationService.name,
          info.stack,
        );
      }
    }

    // Filter by confidence threshold
    const filteredIssues = issues.filter(
      (issue) => issue.confidence >= effectiveConfig.minConfidenceThreshold,
    );

    // Count by severity
    const issuesBySeverity = {
      info: filteredIssues.filter((i) => i.severity === ValidationSeverity.INFO).length,
      warning: filteredIssues.filter((i) => i.severity === ValidationSeverity.WARNING).length,
      error: filteredIssues.filter((i) => i.severity === ValidationSeverity.ERROR).length,
      critical: filteredIssues.filter((i) => i.severity === ValidationSeverity.CRITICAL).length,
    };

    // Determine status
    let status: ValidationResult['status'] = 'passed';
    let requiresManualReview = false;
    let reviewReason: string | undefined;

    if (issuesBySeverity.critical > 0) {
      status = 'failed';
      requiresManualReview = true;
      reviewReason = `${issuesBySeverity.critical} critical issue(s) found`;
    } else if (issuesBySeverity.error > 0) {
      status = 'failed';
      requiresManualReview = true;
      reviewReason = `${issuesBySeverity.error} error(s) found`;
    } else if (issuesBySeverity.warning > 0) {
      status = 'passed-with-warnings';
      if (issuesBySeverity.warning >= 5) {
        requiresManualReview = true;
        reviewReason = `High number of warnings (${issuesBySeverity.warning})`;
      }
    }

    // Calculate scores
    const overallConfidence = expertReport.avgConfidence;
    const qualityScore = this.calculateQualityScore(expertReport, filteredIssues);

    // Auto-fix if enabled
    let autoFixesApplied: ValidationResult['autoFixesApplied'];
    if (applyFixes && effectiveConfig.autoFixEnabled) {
      autoFixesApplied = await this.applyAutoFixes(filteredIssues);
    }

    const endTime = new Date();
    const result: ValidationResult = {
      expertId: expertReport.expertId,
      validatedAt: endTime,
      validationDurationMs: endTime.getTime() - startTime.getTime(),
      status,
      issues: filteredIssues,
      issuesBySeverity,
      overallConfidence,
      qualityScore,
      requiresManualReview,
      reviewReason,
      autoFixesApplied,
    };

    // Add to history
    this.addToHistory(result);

    this.logger.info(
      `Validation complete for ${expertReport.expertId}: ${status} (quality: ${qualityScore.toFixed(1)})`,
      ValidationService.name,
    );

    return result;
  }

  /**
   * Validate multiple expert reports in batch
   */
  async validateBatch(request: BatchValidationRequest): Promise<BatchValidationResult> {
    const startTime = new Date();
    const { expertReports, config, maxConcurrent = 3 } = request;

    this.logger.info(
      `Batch validation of ${expertReports.length} reports`,
      ValidationService.name,
    );

    const results: ValidationResult[] = [];
    
    // Process in chunks to limit concurrency
    for (let i = 0; i < expertReports.length; i += maxConcurrent) {
      const chunk = expertReports.slice(i, i + maxConcurrent);
      const chunkResults = await Promise.all(
        chunk.map((report) =>
          this.validateExpertWork({ expertReport: report, config, applyFixes: false }),
        ),
      );
      results.push(...chunkResults);
    }

    // Calculate aggregate stats
    const aggregateStats = {
      passed: results.filter((r) => r.status === 'passed').length,
      passedWithWarnings: results.filter((r) => r.status === 'passed-with-warnings').length,
      failed: results.filter((r) => r.status === 'failed').length,
      needsReview: results.filter((r) => r.requiresManualReview).length,
      averageQualityScore:
        results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length,
      averageConfidence:
        results.reduce((sum, r) => sum + r.overallConfidence, 0) / results.length,
      totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
    };

    const endTime = new Date();

    return {
      totalReports: expertReports.length,
      results,
      aggregateStats,
      totalDurationMs: endTime.getTime() - startTime.getTime(),
    };
  }

  // ========================================
  // Validation Checks
  // ========================================

  /**
   * Run a specific validation check
   */
  private async runCheck(
    checkType: ValidationCheckType,
    expertReport: ExpertReport,
    _config: ValidationConfig,
  ): Promise<ValidationIssue[]> {
    switch (checkType) {
      case ValidationCheckType.HALLUCINATION_DETECTION:
        return this.checkHallucinations(expertReport);
      
      case ValidationCheckType.SOURCE_VERIFICATION:
        return this.verifySources(expertReport);
      
      case ValidationCheckType.FACT_CONSISTENCY:
        return this.checkFactConsistency(expertReport);
      
      case ValidationCheckType.DUPLICATE_DETECTION:
        return this.checkDuplicates(expertReport);
      
      case ValidationCheckType.RELATIONSHIP_VALIDITY:
        return this.checkRelationships(expertReport);
      
      case ValidationCheckType.CATEGORY_CONSISTENCY:
        return this.checkCategoryConsistency(expertReport);
      
      default:
        this.logger.warn(`Unknown check type: ${checkType}`, ValidationService.name);
        return [];
    }
  }

  /**
   * Check for hallucinations in research
   */
  private async checkHallucinations(expertReport: ExpertReport): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Get all "add-research" modifications
    const researchMods = expertReport.modifications.filter(
      (m) => m.operationType === 'add-research',
    );

    for (const mod of researchMods) {
      // Simple heuristic checks
      const text = (mod.metadata?.summary as string) || '';
      
      // Check 1: Claims without sources
      if (!mod.metadata?.sources || (mod.metadata.sources as unknown[]).length === 0) {
        if (text.length > 100) { // Only flag substantial claims
          issues.push({
            checkType: ValidationCheckType.HALLUCINATION_DETECTION,
            severity: ValidationSeverity.WARNING,
            message: 'Research claim without sources',
            affectedNodeId: mod.nodeId,
            affectedField: 'summary',
            currentValue: text.substring(0, 100) + '...',
            confidence: 0.7,
            details: {
              reason: 'No sources provided for substantial claim',
            },
          });
        }
      }

      // Check 2: Overly confident statements
      const overConfidentPhrases = [
        'definitely',
        'absolutely',
        'certainly',
        'without a doubt',
        'it is proven that',
        'always',
        'never',
      ];

      for (const phrase of overConfidentPhrases) {
        if (text.toLowerCase().includes(phrase)) {
          issues.push({
            checkType: ValidationCheckType.HALLUCINATION_DETECTION,
            severity: ValidationSeverity.INFO,
            message: 'Overly confident language detected',
            affectedNodeId: mod.nodeId,
            affectedField: 'summary',
            currentValue: phrase,
            suggestedFix: 'Consider more measured language',
            confidence: 0.6,
            details: {
              phrase,
              context: this.extractContext(text, phrase),
            },
          });
        }
      }
    }

    return issues;
  }

  /**
   * Verify sources are accessible and valid
   */
  private async verifySources(expertReport: ExpertReport): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Collect all sources from modifications
    const sources = new Set<string>();
    for (const mod of expertReport.modifications) {
      if (mod.metadata?.sources) {
        const modSources = mod.metadata.sources as Array<{ url: string }>;
        modSources.forEach((s) => sources.add(s.url));
      }
    }

    // Verify each source (with timeout and error handling)
    for (const sourceUrl of sources) {
      try {
        const verification = await this.verifySource(sourceUrl);
        
        if (!verification.accessible) {
          issues.push({
            checkType: ValidationCheckType.SOURCE_VERIFICATION,
            severity: ValidationSeverity.ERROR,
            message: 'Source not accessible',
            affectedField: 'sources',
            currentValue: sourceUrl,
            confidence: 0.9,
            details: {
              statusCode: verification.statusCode,
              issues: verification.issues,
            },
          });
        } else if (verification.qualityScore < 50) {
          issues.push({
            checkType: ValidationCheckType.SOURCE_VERIFICATION,
            severity: ValidationSeverity.WARNING,
            message: 'Low-quality source detected',
            affectedField: 'sources',
            currentValue: sourceUrl,
            confidence: 0.75,
            details: {
              qualityScore: verification.qualityScore,
              sourceType: verification.sourceType,
            },
          });
        }
      } catch (error) {
        const info = getErrorInfo(error);
        issues.push({
          checkType: ValidationCheckType.SOURCE_VERIFICATION,
          severity: ValidationSeverity.WARNING,
          message: 'Could not verify source',
          affectedField: 'sources',
          currentValue: sourceUrl,
          confidence: 0.5,
          details: {
            error: info.message,
          },
        });
      }
    }

    return issues;
  }

  /**
   * Check for fact consistency with existing knowledge graph
   */
  private async checkFactConsistency(expertReport: ExpertReport): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Get all created nodes
    const createdNodes = expertReport.modifications
      .filter((m) => m.operationType === 'create-node' && m.success)
      .map((m) => m.nodeId);

    // For each node, check consistency with related nodes
    for (const nodeId of createdNodes) {
      if (!nodeId) continue;

      try {
        const node = await this.knowledgeGraph.getNode(nodeId);
        if (!node) continue;

        // Get related nodes (this is simplified - real implementation would check edges)
        const relatedNodes = await this.knowledgeGraph.getNodesByType(node.type);

        // Check for contradictions (simplified heuristic)
        for (const related of relatedNodes) {
          if (related._id === nodeId) continue;

          // Check label similarity but different properties
          if (this.areLabelsSimilar(node.label, related.label)) {
            // Check if properties conflict
            const conflicts = this.findPropertyConflicts(node, related);
            if (conflicts.length > 0) {
              issues.push({
                checkType: ValidationCheckType.FACT_CONSISTENCY,
                severity: ValidationSeverity.WARNING,
                message: 'Potential fact inconsistency with existing knowledge',
                affectedNodeId: nodeId,
                confidence: 0.65,
                details: {
                  relatedNodeId: related._id,
                  relatedLabel: related.label,
                  conflicts,
                },
              });
            }
          }
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Fact consistency check failed for ${nodeId}: ${info.message}`,
          ValidationService.name,
        );
      }
    }

    return issues;
  }

  /**
   * Check for duplicate nodes
   */
  private async checkDuplicates(expertReport: ExpertReport): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    const createdNodes = expertReport.modifications
      .filter((m) => m.operationType === 'create-node' && m.success)
      .map((m) => m.nodeId);

    for (const nodeId of createdNodes) {
      if (!nodeId) continue;

      try {
        const node = await this.knowledgeGraph.getNode(nodeId);
        if (!node) continue;

        // Search for similar nodes
        const existingNodes = await this.knowledgeGraph.getNodesByType(node.type);
        
        for (const existing of existingNodes) {
          if (existing._id === nodeId) continue;

          // Check for high similarity
          const similarity = this.calculateNodeSimilarity(node, existing);
          if (similarity > 0.85) {
            issues.push({
              checkType: ValidationCheckType.DUPLICATE_DETECTION,
              severity: ValidationSeverity.WARNING,
              message: 'Possible duplicate node detected',
              affectedNodeId: nodeId,
              suggestedFix: `Consider merging with ${existing._id}`,
              confidence: similarity,
              details: {
                duplicateNodeId: existing._id,
                duplicateLabel: existing.label,
                similarityScore: similarity,
              },
            });
          }
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Duplicate check failed for ${nodeId}: ${info.message}`,
          ValidationService.name,
        );
      }
    }

    return issues;
  }

  /**
   * Check relationship validity
   */
  private async checkRelationships(expertReport: ExpertReport): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    const edgeMods = expertReport.modifications.filter(
      (m) => m.operationType === 'create-edge' && m.success,
    );

    for (const mod of edgeMods) {
      // Check if source and target exist and are compatible
      const edgeData = mod.metadata?.edge as { source: string; target: string; type: string } | undefined;
      
      if (!edgeData) continue;

      try {
        const [source, target] = await Promise.all([
          this.knowledgeGraph.getNode(edgeData.source as any),
          this.knowledgeGraph.getNode(edgeData.target as any),
        ]);

        if (!source || !target) {
          issues.push({
            checkType: ValidationCheckType.RELATIONSHIP_VALIDITY,
            severity: ValidationSeverity.ERROR,
            message: 'Edge references non-existent node',
            confidence: 1.0,
            details: {
              missingSource: !source,
              missingTarget: !target,
            },
          });
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Relationship check failed: ${info.message}`,
          ValidationService.name,
        );
      }
    }

    return issues;
  }

  /**
   * Check category consistency
   */
  private async checkCategoryConsistency(expertReport: ExpertReport): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    const createdNodes = expertReport.modifications
      .filter((m) => m.operationType === 'create-node' && m.success)
      .map((m) => m.nodeId);

    for (const nodeId of createdNodes) {
      if (!nodeId) continue;

      try {
        const node = await this.knowledgeGraph.getNode(nodeId);
        if (!node) continue;

        const category = node.properties?.category as string | undefined;
        
        // Check if category is set
        if (!category) {
          issues.push({
            checkType: ValidationCheckType.CATEGORY_CONSISTENCY,
            severity: ValidationSeverity.INFO,
            message: 'Node missing category',
            affectedNodeId: nodeId,
            affectedField: 'properties.category',
            confidence: 1.0,
          });
        }
      } catch (error) {
        const info = getErrorInfo(error);
        this.logger.error(
          `Category check failed for ${nodeId}: ${info.message}`,
          ValidationService.name,
        );
      }
    }

    return issues;
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Verify a single source URL
   */
  private async verifySource(url: string): Promise<SourceVerificationResult> {
    try {
      const response = await axios.head(url, { timeout: 5000 });
      
      return {
        sourceUrl: url,
        accessible: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        contentMatches: true, // Would need content analysis for real verification
        matchConfidence: 0.5,
        qualityScore: this.calculateSourceQuality(url),
        sourceType: this.categorizeSource(url),
        issues: [],
      };
    } catch {
      return {
        sourceUrl: url,
        accessible: false,
        contentMatches: false,
        matchConfidence: 0,
        qualityScore: 0,
        sourceType: 'unknown',
        issues: ['Source not accessible'],
      };
    }
  }

  /**
   * Calculate source quality score
   */
  private calculateSourceQuality(url: string): number {
    let score = 50; // Base score

    // Academic sources
    if (url.includes('.edu') || url.includes('scholar.google') || url.includes('arxiv.org')) {
      score += 30;
    }

    // Government sources
    if (url.includes('.gov')) {
      score += 25;
    }

    // Wikipedia (decent but not perfect)
    if (url.includes('wikipedia.org')) {
      score += 15;
    }

    // News sources (varies widely)
    if (url.includes('.com') && (url.includes('news') || url.includes('times'))) {
      score += 10;
    }

    // Blog or personal site
    if (url.includes('blog') || url.includes('wordpress') || url.includes('medium.com')) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Categorize source type
   */
  private categorizeSource(url: string): SourceVerificationResult['sourceType'] {
    if (url.includes('.edu') || url.includes('scholar') || url.includes('arxiv')) {
      return 'academic';
    }
    if (url.includes('.gov')) {
      return 'government';
    }
    if (url.includes('wikipedia.org')) {
      return 'wiki';
    }
    if (url.includes('news') || url.includes('times') || url.includes('post')) {
      return 'news';
    }
    if (url.includes('blog') || url.includes('medium.com')) {
      return 'blog';
    }
    return 'commercial';
  }

  /**
   * Check if two labels are similar
   */
  private areLabelsSimilar(label1: string, label2: string): boolean {
    const normalized1 = label1.toLowerCase().trim();
    const normalized2 = label2.toLowerCase().trim();
    
    // Exact match
    if (normalized1 === normalized2) return true;
    
    // One contains the other
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return normalized1.length > 3 && normalized2.length > 3; // Avoid short matches
    }
    
    return false;
  }

  /**
   * Find property conflicts between nodes
   */
  private findPropertyConflicts(node1: KnowledgeNode, node2: KnowledgeNode): string[] {
    const conflicts: string[] = [];
    
    if (!node1.properties || !node2.properties) return conflicts;

    const keys1 = Object.keys(node1.properties);
    const keys2 = Object.keys(node2.properties);
    const commonKeys = keys1.filter((k) => keys2.includes(k));

    for (const key of commonKeys) {
      const val1 = node1.properties[key];
      const val2 = node2.properties[key];
      
      if (val1 !== val2 && typeof val1 === typeof val2) {
        conflicts.push(`${key}: "${val1}" vs "${val2}"`);
      }
    }

    return conflicts;
  }

  /**
   * Calculate similarity between two nodes
   */
  private calculateNodeSimilarity(node1: KnowledgeNode, node2: KnowledgeNode): number {
    let score = 0;
    let factors = 0;

    // Label similarity
    if (this.areLabelsSimilar(node1.label, node2.label)) {
      score += 0.4;
    }
    factors++;

    // Type match
    if (node1.type === node2.type) {
      score += 0.3;
    }
    factors++;

    // Layer match
    if (node1.layer === node2.layer) {
      score += 0.1;
    }
    factors++;

    // Property overlap
    if (node1.properties && node2.properties) {
      const keys1 = Object.keys(node1.properties);
      const keys2 = Object.keys(node2.properties);
      const commonKeys = keys1.filter((k) => keys2.includes(k));
      const overlap = commonKeys.length / Math.max(keys1.length, keys2.length);
      score += overlap * 0.2;
      factors++;
    }

    return score / factors;
  }

  /**
   * Extract context around a phrase in text
   */
  private extractContext(text: string, phrase: string, contextLength = 50): string {
    const index = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + phrase.length + contextLength);
    
    return text.substring(start, end);
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(expertReport: ExpertReport, issues: ValidationIssue[]): number {
    let score = 100;

    // Deduct for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case ValidationSeverity.CRITICAL:
          score -= 25;
          break;
        case ValidationSeverity.ERROR:
          score -= 15;
          break;
        case ValidationSeverity.WARNING:
          score -= 5;
          break;
        case ValidationSeverity.INFO:
          score -= 1;
          break;
      }
    }

    // Adjust for confidence
    score *= expertReport.avgConfidence;

    // Adjust for source usage
    if (expertReport.sourcesUsed === 0) {
      score *= 0.5; // Heavy penalty for no sources
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Apply automatic fixes where possible
   */
  private async applyAutoFixes(issues: ValidationIssue[]): Promise<ValidationResult['autoFixesApplied']> {
    const fixes: NonNullable<ValidationResult['autoFixesApplied']> = [];

    for (const issue of issues) {
      if (!issue.suggestedFix || !issue.affectedNodeId) continue;

      try {
        // Apply fix based on issue type
        // (This is a placeholder - real implementation would apply actual fixes)
        const success = false; // Would perform actual fix operation

        fixes.push({
          issue,
          fixApplied: issue.suggestedFix,
          success,
        });
      } catch {
        fixes.push({
          issue,
          fixApplied: issue.suggestedFix,
          success: false,
        });
      }
    }

    return fixes;
  }

  /**
   * Add result to history
   */
  private addToHistory(result: ValidationResult): void {
    this.validationHistory.push(result);
    if (this.validationHistory.length > this.maxHistorySize) {
      this.validationHistory.shift();
    }
  }

  /**
   * Get validation history
   */
  getHistory(limit?: number): ValidationResult[] {
    if (limit) {
      return this.validationHistory.slice(-limit);
    }
    return [...this.validationHistory];
  }

  /**
   * Get validation statistics
   */
  getStatistics(): ValidationStatistics {
    const history = this.validationHistory;

    if (history.length === 0) {
      return {
        totalValidations: 0,
        validationsByStatus: { passed: 0, passedWithWarnings: 0, failed: 0, needsReview: 0 },
        issuesByType: {} as Record<ValidationCheckType, number>,
        issuesBySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
        averageQualityScore: 0,
        averageConfidence: 0,
        totalAutoFixesApplied: 0,
        autoFixSuccessRate: 0,
      };
    }

    const validationsByStatus = {
      passed: history.filter((r) => r.status === 'passed').length,
      passedWithWarnings: history.filter((r) => r.status === 'passed-with-warnings').length,
      failed: history.filter((r) => r.status === 'failed').length,
      needsReview: history.filter((r) => r.requiresManualReview).length,
    };

    const issuesByType: Record<string, number> = {};
    const issuesBySeverity = { info: 0, warning: 0, error: 0, critical: 0 };

    for (const result of history) {
      for (const issue of result.issues) {
        issuesByType[issue.checkType] = (issuesByType[issue.checkType] || 0) + 1;
        issuesBySeverity[issue.severity]++;
      }
    }

    const averageQualityScore =
      history.reduce((sum, r) => sum + r.qualityScore, 0) / history.length;
    
    const averageConfidence =
      history.reduce((sum, r) => sum + r.overallConfidence, 0) / history.length;

    const totalAutoFixesApplied = history.reduce(
      (sum, r) => sum + (r.autoFixesApplied?.length || 0),
      0,
    );

    const successfulFixes = history.reduce(
      (sum, r) => sum + (r.autoFixesApplied?.filter((f) => f.success).length || 0),
      0,
    );

    const autoFixSuccessRate = totalAutoFixesApplied > 0 ? successfulFixes / totalAutoFixesApplied : 0;

    return {
      totalValidations: history.length,
      validationsByStatus,
      issuesByType: issuesByType as Record<ValidationCheckType, number>,
      issuesBySeverity,
      averageQualityScore,
      averageConfidence,
      totalAutoFixesApplied,
      autoFixSuccessRate,
    };
  }

  /**
   * Clear validation history
   */
  clearHistory(): void {
    this.validationHistory = [];
    this.logger.info('Validation history cleared', ValidationService.name);
  }
}
