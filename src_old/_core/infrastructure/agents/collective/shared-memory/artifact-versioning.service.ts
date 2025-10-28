import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectiveArtifact, CollectiveArtifactDocument } from '../entities/collective-artifact.entity';
import { CollectiveArtifactsRepository } from '../repositories/collective-artifacts.repository';
import { CollectiveEventsRepository } from '../repositories/collective-events.repository';
import { EventType, ActorType, TargetType } from '../entities/collective-event.entity';
import * as crypto from 'crypto';

/**
 * ArtifactVersioningService
 * 
 * Tracks artifact history with full version control capabilities.
 * 
 * Features:
 * - Automatic versioning on every update
 * - Version history with diffs
 * - Rollback to previous versions
 * - Version comparison
 * - Branch/merge support (future)
 * 
 * Use Cases:
 * - Agent updates shared document, PM wants to see what changed
 * - Rollback to previous version if update was incorrect
 * - Compare two versions to understand evolution
 * - Audit trail of who changed what and when
 */
@Injectable()
export class ArtifactVersioningService {
  private readonly logger = new Logger(ArtifactVersioningService.name);

  // Version storage (in production, use separate collection)
  private readonly versionHistory = new Map<string, ArtifactVersion[]>();
  
  // Configuration
  private readonly MAX_VERSIONS_PER_ARTIFACT = 100;
  private readonly AUTO_VERSION_ON_UPDATE = true;

  constructor(
    @InjectModel(CollectiveArtifact.name) private artifactModel: Model<CollectiveArtifactDocument>,
    private readonly artifactsRepo: CollectiveArtifactsRepository,
    private readonly eventsRepo: CollectiveEventsRepository,
  ) {}

  /**
   * Create a new version of an artifact.
   */
  async createVersion(
    artifactId: string | Types.ObjectId,
    content: string,
    agentId: string,
    changeDescription?: string,
  ): Promise<ArtifactVersion> {
    const artifact = await this.artifactModel.findById(artifactId);
    if (!artifact) {
      throw new Error('Artifact not found');
    }

    const artifactIdStr = artifactId.toString();
    const versions = this.versionHistory.get(artifactIdStr) || [];

    // Get previous version for diff
    const previousVersion = versions[versions.length - 1];
    const previousContent = previousVersion?.content || artifact.content;

    // Create version
    const version: ArtifactVersion = {
      versionNumber: versions.length + 1,
      artifactId: artifactIdStr,
      content,
      contentHash: this.hashContent(content),
      createdBy: agentId,
      createdAt: new Date(),
      changeDescription: changeDescription || 'Updated artifact',
      diff: this.generateDiff(previousContent, content),
      metadata: {
        size: content.length,
        previousHash: previousVersion?.contentHash,
      },
    };

    versions.push(version);

    // Limit version history
    if (versions.length > this.MAX_VERSIONS_PER_ARTIFACT) {
      versions.shift(); // Remove oldest version
    }

    this.versionHistory.set(artifactIdStr, versions);

    // Update artifact
    await this.artifactsRepo.updateArtifact(artifactId, {
      content,
      metadata: {
        ...artifact.metadata,
        currentVersion: version.versionNumber,
        totalVersions: versions.length,
        updatedBy: agentId,
      },
    });

    // Log version event
    await this.eventsRepo.create({
      collectiveId: artifact.collectiveId as any,
      type: EventType.ARTIFACT_VERSIONED,
      timestamp: new Date(),
      actorId: agentId,
      actorType: ActorType.AGENT,
      targetType: TargetType.ARTIFACT,
      targetId: artifactIdStr,
      description: `Artifact versioned: ${artifact.name}`,
      metadata: {
        versionNumber: version.versionNumber,
        changeDescription: version.changeDescription,
        diffSize: version.diff?.length || 0,
      },
    });

    this.logger.log(
      `Created version ${version.versionNumber} of artifact ${artifactIdStr} by ${agentId}`,
    );

    return version;
  }

  /**
   * Get version history for an artifact.
   */
  async getVersionHistory(
    artifactId: string | Types.ObjectId,
    options: {
      limit?: number;
      skip?: number;
      ascending?: boolean;
    } = {},
  ): Promise<ArtifactVersion[]> {
    const artifactIdStr = artifactId.toString();
    let versions = this.versionHistory.get(artifactIdStr) || [];

    // Sort
    if (!options.ascending) {
      versions = [...versions].reverse();
    }

    // Pagination
    if (options.skip) {
      versions = versions.slice(options.skip);
    }
    if (options.limit) {
      versions = versions.slice(0, options.limit);
    }

    return versions;
  }

  /**
   * Get a specific version.
   */
  async getVersion(
    artifactId: string | Types.ObjectId,
    versionNumber: number,
  ): Promise<ArtifactVersion | null> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];
    return versions.find(v => v.versionNumber === versionNumber) || null;
  }

  /**
   * Get the latest version.
   */
  async getLatestVersion(
    artifactId: string | Types.ObjectId,
  ): Promise<ArtifactVersion | null> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];
    return versions[versions.length - 1] || null;
  }

  /**
   * Rollback to a previous version.
   */
  async rollbackToVersion(
    artifactId: string | Types.ObjectId,
    versionNumber: number,
    agentId: string,
  ): Promise<ArtifactVersion> {
    const version = await this.getVersion(artifactId, versionNumber);
    if (!version) {
      throw new Error(`Version ${versionNumber} not found`);
    }

    this.logger.log(
      `Rolling back artifact ${artifactId} to version ${versionNumber} by ${agentId}`,
    );

    // Create new version with old content (rollback creates new version)
    return this.createVersion(
      artifactId,
      version.content,
      agentId,
      `Rolled back to version ${versionNumber}`,
    );
  }

  /**
   * Compare two versions.
   */
  async compareVersions(
    artifactId: string | Types.ObjectId,
    version1: number,
    version2: number,
  ): Promise<{
    version1: ArtifactVersion;
    version2: ArtifactVersion;
    diff: string;
    changesSummary: {
      linesAdded: number;
      linesRemoved: number;
      linesChanged: number;
    };
  }> {
    const v1 = await this.getVersion(artifactId, version1);
    const v2 = await this.getVersion(artifactId, version2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const diff = this.generateDiff(v1.content, v2.content);
    const changesSummary = this.analyzeDiff(diff);

    return {
      version1: v1,
      version2: v2,
      diff,
      changesSummary,
    };
  }

  /**
   * Get version statistics.
   */
  async getVersionStats(artifactId: string | Types.ObjectId): Promise<{
    totalVersions: number;
    firstVersion: Date | null;
    lastVersion: Date | null;
    contributors: string[];
    avgTimeBetweenVersions: number;
    totalChanges: {
      linesAdded: number;
      linesRemoved: number;
    };
  }> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];

    if (versions.length === 0) {
      return {
        totalVersions: 0,
        firstVersion: null,
        lastVersion: null,
        contributors: [],
        avgTimeBetweenVersions: 0,
        totalChanges: { linesAdded: 0, linesRemoved: 0 },
      };
    }

    const contributors = [...new Set(versions.map(v => v.createdBy))];
    
    // Calculate average time between versions
    let totalTimeDiff = 0;
    for (let i = 1; i < versions.length; i++) {
      totalTimeDiff += 
        versions[i].createdAt.getTime() - versions[i - 1].createdAt.getTime();
    }
    const avgTimeBetweenVersions = 
      versions.length > 1 ? totalTimeDiff / (versions.length - 1) : 0;

    // Calculate total changes
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    for (const version of versions) {
      if (version.diff) {
        const analysis = this.analyzeDiff(version.diff);
        totalLinesAdded += analysis.linesAdded;
        totalLinesRemoved += analysis.linesRemoved;
      }
    }

    return {
      totalVersions: versions.length,
      firstVersion: versions[0].createdAt,
      lastVersion: versions[versions.length - 1].createdAt,
      contributors,
      avgTimeBetweenVersions,
      totalChanges: {
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved,
      },
    };
  }

  /**
   * Delete old versions (keep only recent N versions).
   */
  async pruneVersionHistory(
    artifactId: string | Types.ObjectId,
    keepCount: number = 10,
  ): Promise<number> {
    const artifactIdStr = artifactId.toString();
    const versions = this.versionHistory.get(artifactIdStr) || [];

    if (versions.length <= keepCount) {
      return 0; // Nothing to prune
    }

    const toRemove = versions.length - keepCount;
    const remaining = versions.slice(toRemove);
    
    this.versionHistory.set(artifactIdStr, remaining);

    this.logger.log(`Pruned ${toRemove} old versions from artifact ${artifactIdStr}`);

    return toRemove;
  }

  /**
   * Export version history (for backup/migration).
   */
  async exportVersionHistory(
    artifactId: string | Types.ObjectId,
  ): Promise<string> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];
    return JSON.stringify(versions, null, 2);
  }

  /**
   * Import version history (for restore/migration).
   */
  async importVersionHistory(
    artifactId: string | Types.ObjectId,
    historyJson: string,
  ): Promise<number> {
    const versions: ArtifactVersion[] = JSON.parse(historyJson);
    this.versionHistory.set(artifactId.toString(), versions);
    
    this.logger.log(`Imported ${versions.length} versions for artifact ${artifactId}`);
    
    return versions.length;
  }

  /**
   * Check if artifact has been modified since version.
   */
  async hasChangedSince(
    artifactId: string | Types.ObjectId,
    versionNumber: number,
  ): Promise<boolean> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];
    const latestVersion = versions[versions.length - 1];
    
    if (!latestVersion) return false;
    
    return latestVersion.versionNumber > versionNumber;
  }

  /**
   * Get all versions created by an agent.
   */
  async getAgentVersions(
    artifactId: string | Types.ObjectId,
    agentId: string,
  ): Promise<ArtifactVersion[]> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];
    return versions.filter(v => v.createdBy === agentId);
  }

  /**
   * Generate a diff between two content strings.
   */
  private generateDiff(oldContent: string, newContent: string): string {
    // Simple line-based diff (in production, use a proper diff library)
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    let diff = '';
    const maxLen = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (oldLine && !newLine) {
          diff += `- ${oldLine}\n`;
        } else if (!oldLine && newLine) {
          diff += `+ ${newLine}\n`;
        } else {
          diff += `- ${oldLine}\n`;
          diff += `+ ${newLine}\n`;
        }
      }
    }
    
    return diff || 'No changes';
  }

  /**
   * Analyze a diff to count changes.
   */
  private analyzeDiff(diff: string): {
    linesAdded: number;
    linesRemoved: number;
    linesChanged: number;
  } {
    const lines = diff.split('\n');
    let added = 0;
    let removed = 0;
    
    for (const line of lines) {
      if (line.startsWith('+')) added++;
      if (line.startsWith('-')) removed++;
    }
    
    // Changed lines are pairs of removals and additions
    const changed = Math.min(added, removed);
    
    return {
      linesAdded: added - changed,
      linesRemoved: removed - changed,
      linesChanged: changed,
    };
  }

  /**
   * Hash content for integrity checking.
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify content integrity against hash.
   */
  verifyIntegrity(content: string, expectedHash: string): boolean {
    const actualHash = this.hashContent(content);
    return actualHash === expectedHash;
  }

  /**
   * Get version by hash (useful for integrity checks).
   */
  async getVersionByHash(
    artifactId: string | Types.ObjectId,
    contentHash: string,
  ): Promise<ArtifactVersion | null> {
    const versions = this.versionHistory.get(artifactId.toString()) || [];
    return versions.find(v => v.contentHash === contentHash) || null;
  }
}

interface ArtifactVersion {
  versionNumber: number;
  artifactId: string;
  content: string;
  contentHash: string;
  createdBy: string;
  createdAt: Date;
  changeDescription: string;
  diff: string;
  metadata: {
    size: number;
    previousHash?: string;
    tags?: string[];
    [key: string]: any;
  };
}
