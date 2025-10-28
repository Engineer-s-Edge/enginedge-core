import { Injectable } from '@nestjs/common';
import BaseAgent from '../structures/base';
import { AgentState } from '../types/agent.entity';
import { AgentType } from './factory.service';
import {
  ConversationIdType,
  UserIdType,
  NodeIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';

export interface UserInteractionContext {
  nodeId: NodeIdType;
  nodeName: string;
  type: 'approval' | 'input' | 'chat_continuation';
  timestamp: Date;
  context?: any;
  interactionId: string;
  timeoutTimer?: NodeJS.Timeout;
}

export interface AgentControlOptions {
  pauseOnUserInteraction?: boolean;
  userInteractionTimeout?: number; // milliseconds
  autoResumeOnTimeout?: boolean;
  maxConcurrentInteractions?: number;
}

export interface AgentSessionState {
  agentType: AgentType | string; // Support unique types
  userId: UserIdType;
  conversationId: ConversationIdType;
  status: 'idle' | 'running' | 'paused' | 'awaiting_user_interaction' | 'error';
  currentExecution?: {
    startTime: Date;
    input: string;
    executionId: string;
  };
  pendingUserInteractions: Map<string, UserInteractionContext>;
  eventFilters: {
    include?: string[];
    exclude?: string[];
  };
  controlOptions: AgentControlOptions;
}

@Injectable()
export class AgentSessionService {
  private readonly agentInstances = new Map<string, BaseAgent>();
  private readonly agentSessions = new Map<string, AgentSessionState>();
  private readonly userInteractionRegistry = new Map<
    string,
    UserInteractionContext
  >();

  constructor(private readonly logger: MyLogger) {
    this.logger.info(
      'AgentSessionService initializing',
      AgentSessionService.name,
    );
  }
  /**
   * Create a new agent session
   */
  createSession(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    agent: BaseAgent,
  ): AgentSessionState {
    this.logger.info(
      `Creating session for agent type ${type}, user ${userId}, conversation ${conversationId}`,
      AgentSessionService.name,
    );
    const instanceKey = this.getInstanceKey(userId, conversationId, type);

    // Create session state
    const sessionState: AgentSessionState = {
      agentType: type,
      userId,
      conversationId,
      status: 'idle',
      pendingUserInteractions: new Map(),
      eventFilters: {},
      controlOptions: {
        pauseOnUserInteraction: true,
        userInteractionTimeout: 5 * 60 * 1000, // 5 minutes
        autoResumeOnTimeout: false,
        maxConcurrentInteractions: 3,
      },
    };

    this.agentSessions.set(instanceKey, sessionState);
    this.agentInstances.set(instanceKey, agent);

    this.logger.info(
      `Session created successfully for agent ${instanceKey}`,
      AgentSessionService.name,
    );
    this.logger.debug(
      `Total sessions: ${this.agentSessions.size}, total instances: ${this.agentInstances.size}`,
      AgentSessionService.name,
    );
    return sessionState;
  }

  /**
   * Get agent instance
   */
  getAgentInstance(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): BaseAgent | undefined {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    const agent = this.agentInstances.get(instanceKey);
    this.logger.debug(
      `Getting agent instance ${instanceKey} - ${agent ? 'found' : 'not found'}`,
      AgentSessionService.name,
    );
    return agent;
  }

  /**
   * Get session state
   */
  getSessionState(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): AgentSessionState | undefined {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    const sessionState = this.agentSessions.get(instanceKey);
    this.logger.debug(
      `Getting session state ${instanceKey} - ${sessionState ? 'found' : 'not found'}`,
      AgentSessionService.name,
    );
    return sessionState;
  }
  /**
   * Update session status
   */
  updateSessionStatus(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    status: AgentSessionState['status'],
  ): void {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    this.logger.info(
      `Updating session status to ${status} for agent ${instanceKey}`,
      AgentSessionService.name,
    );
    const sessionState = this.getSessionState(userId, conversationId, type);
    if (sessionState) {
      sessionState.status = status;
      this.logger.debug(
        `Session status updated successfully for ${instanceKey}`,
        AgentSessionService.name,
      );
    } else {
      this.logger.warn(
        `Session state not found for ${instanceKey}`,
        AgentSessionService.name,
      );
    }
  }
  /**
   * Set current execution for a session
   */
  setCurrentExecution(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    execution: AgentSessionState['currentExecution'],
  ): void {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    this.logger.info(
      `Setting current execution for agent ${instanceKey}`,
      AgentSessionService.name,
    );
    const sessionState = this.getSessionState(userId, conversationId, type);
    if (sessionState) {
      sessionState.currentExecution = execution;
      this.logger.debug(
        `Current execution set successfully for ${instanceKey}`,
        AgentSessionService.name,
      );
    } else {
      this.logger.warn(
        `Session state not found for ${instanceKey}`,
        AgentSessionService.name,
      );
    }
  }
  /**
   * Clear current execution for a session
   */
  clearCurrentExecution(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): void {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    this.logger.info(
      `Clearing current execution for agent ${instanceKey}`,
      AgentSessionService.name,
    );
    const sessionState = this.getSessionState(userId, conversationId, type);
    if (sessionState) {
      sessionState.currentExecution = undefined;
      this.logger.debug(
        `Current execution cleared successfully for ${instanceKey}`,
        AgentSessionService.name,
      );
    } else {
      this.logger.warn(
        `Session state not found for ${instanceKey}`,
        AgentSessionService.name,
      );
    }
  }
  /**
   * Check if agent instance exists
   */
  hasAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): boolean {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    const hasAgent = this.agentInstances.has(instanceKey);
    this.logger.debug(
      `Checking if agent exists ${instanceKey} - ${hasAgent ? 'exists' : 'not found'}`,
      AgentSessionService.name,
    );
    return hasAgent;
  }
  /**
   * Remove agent instance and session
   */
  removeAgent(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): BaseAgent | undefined {
    const instanceKey = this.getInstanceKey(userId, conversationId, type);
    this.logger.info(`Removing agent ${instanceKey}`, AgentSessionService.name);
    const agent = this.agentInstances.get(instanceKey);

    if (!agent) {
      this.logger.warn(
        `Agent ${instanceKey} not found for removal`,
        AgentSessionService.name,
      );
      return undefined;
    }

    // Capture session state BEFORE deletion for proper cleanup
    const sessionState = this.agentSessions.get(instanceKey);

    // Remove from registries
    this.agentInstances.delete(instanceKey);
    this.agentSessions.delete(instanceKey);

    // Clean up any pending user interactions using captured state
    if (sessionState) {
      this.logger.debug(
        `Cleaning up ${sessionState.pendingUserInteractions.size} pending user interactions`,
        AgentSessionService.name,
      );
  for (const [_interactionId, context] of sessionState.pendingUserInteractions) {
        if (context.timeoutTimer) {
          clearTimeout(context.timeoutTimer);
        }
  this.userInteractionRegistry.delete(_interactionId);
      }
    }

    this.logger.info(
      `Agent ${instanceKey} removed successfully`,
      AgentSessionService.name,
    );

    return agent;
  }

  /**
   * Clear all agent instances and sessions
   */
  clearAllAgents(): void {
    this.logger.info(
      'Clearing all agent instances and sessions',
      AgentSessionService.name,
    );
    // Clean up all timers first
    let totalInteractions = 0;
    for (const sessionState of this.agentSessions.values()) {
      totalInteractions += sessionState.pendingUserInteractions.size;
      for (const [
        _interactionId,
        context,
      ] of sessionState.pendingUserInteractions) {
        if (context.timeoutTimer) {
          clearTimeout(context.timeoutTimer);
        }
      }
    }

    this.logger.debug(
      `Cleaning up ${totalInteractions} total user interactions`,
      AgentSessionService.name,
    );
    this.agentInstances.clear();
    this.agentSessions.clear();
    this.userInteractionRegistry.clear();
    this.logger.info(
      'All agent instances and sessions cleared successfully',
      AgentSessionService.name,
    );
  }
  /**
   * Get all agent instances for a user
   */
  getUserAgents(userId: UserIdType): Array<{
    conversationId: ConversationIdType;
    type: AgentType | string; // Support unique types
    state: AgentState;
    agent: BaseAgent;
    sessionState: AgentSessionState;
  }> {
    this.logger.info(
      `Getting all agent instances for user ${userId}`,
      AgentSessionService.name,
    );
    const userAgents: Array<{
      conversationId: ConversationIdType;
      type: AgentType | string; // Support unique types
      state: AgentState;
      agent: BaseAgent;
      sessionState: AgentSessionState;
    }> = [];

    for (const [key, agent] of this.agentInstances) {
      const [keyUserId, conversationId, type] = key.split(':');
      if (keyUserId === userId) {
        const sessionState = this.agentSessions.get(key);
        if (sessionState) {
          userAgents.push({
            conversationId: conversationId as ConversationIdType,
            type: type as AgentType | string, // Support unique types
            state: agent.state,
            agent,
            sessionState,
          });
        }
      }
    }

    this.logger.info(
      `Found ${userAgents.length} agent instances for user ${userId}`,
      AgentSessionService.name,
    );
    return userAgents;
  }
  /**
   * Get all agent instances for a conversation
   */
  getConversationAgents(
    userId: UserIdType,
    conversationId: ConversationIdType,
  ): Array<{
    type: AgentType | string; // Support unique types
    state: AgentState;
    agent: BaseAgent;
    sessionState: AgentSessionState;
  }> {
    this.logger.info(
      `Getting all agent instances for conversation ${conversationId}, user ${userId}`,
      AgentSessionService.name,
    );
    const conversationAgents: Array<{
      type: AgentType | string; // Support unique types
      state: AgentState;
      agent: BaseAgent;
      sessionState: AgentSessionState;
    }> = [];

    for (const [key, agent] of this.agentInstances) {
      const [keyUserId, keyConversationId, type] = key.split(':');
      if (keyUserId === userId && keyConversationId === conversationId) {
        const sessionState = this.agentSessions.get(key);
        if (sessionState) {
          conversationAgents.push({
            type: type as AgentType | string, // Support unique types
            state: agent.state,
            agent,
            sessionState,
          });
        }
      }
    }

    this.logger.info(
      `Found ${conversationAgents.length} agent instances for conversation ${conversationId}`,
      AgentSessionService.name,
    );
    return conversationAgents;
  }

  /**
   * Update agent instance key (for conversation switching)
   */ updateInstanceKey(
    userId: UserIdType,
    oldConversationId: ConversationIdType,
    newConversationId: ConversationIdType,
    type: AgentType | string,
  ): void {
    this.logger.info(
      `Updating instance key for agent type ${type}, user ${userId}`,
      AgentSessionService.name,
    );
    this.logger.debug(
      `Old conversation: ${oldConversationId}, new conversation: ${newConversationId}`,
      AgentSessionService.name,
    );
    const oldKey = this.getInstanceKey(userId, oldConversationId, type);
    const newKey = this.getInstanceKey(userId, newConversationId, type);

    const agent = this.agentInstances.get(oldKey);
    const sessionState = this.agentSessions.get(oldKey);

    if (agent && sessionState) {
      // Update conversation ID in session state
      sessionState.conversationId = newConversationId;

      // Move to new key
      this.agentInstances.set(newKey, agent);
      this.agentSessions.set(newKey, sessionState);

      // Remove old key
      this.agentInstances.delete(oldKey);
      this.agentSessions.delete(oldKey);

      this.logger.info(
        `Instance key updated successfully from ${oldKey} to ${newKey}`,
        AgentSessionService.name,
      );
    } else {
      this.logger.warn(
        `Agent or session state not found for key ${oldKey}`,
        AgentSessionService.name,
      );
    }
  }

  /**
   * Get agent statistics
   */
  getAgentStats(): {
    totalInstances: number;
    instancesByType: Record<string, number>;
    instancesByState: Record<string, number>;
    sessionsByStatus: Record<string, number>;
  } {
    this.logger.info('Getting agent statistics', AgentSessionService.name);
    const totalInstances = this.agentInstances.size;
    const instancesByType: Record<string, number> = {};
    const instancesByState: Record<string, number> = {};
    const sessionsByStatus: Record<string, number> = {};

    for (const [key, agent] of this.agentInstances) {
      const type = key.split(':')[2];
      instancesByType[type] = (instancesByType[type] || 0) + 1;
      instancesByState[agent.state] = (instancesByState[agent.state] || 0) + 1;
    }

    for (const sessionState of this.agentSessions.values()) {
      sessionsByStatus[sessionState.status] =
        (sessionsByStatus[sessionState.status] || 0) + 1;
    }

    const stats = {
      totalInstances,
      instancesByType,
      instancesByState,
      sessionsByStatus,
    };

    this.logger.debug(
      `Agent statistics - total instances: ${totalInstances}, types: ${Object.keys(instancesByType).length}, states: ${Object.keys(instancesByState).length}`,
      AgentSessionService.name,
    );
    return stats;
  }

  /**
   * Enumerate all agent instances across all users and conversations
   */
  getAllAgents(): Array<{
    userId: UserIdType;
    conversationId: ConversationIdType;
    type: AgentType | string; // Support unique types
    state: AgentState;
    agent: BaseAgent;
    sessionState: AgentSessionState;
  }> {
    this.logger.info('Enumerating all agent instances', AgentSessionService.name);
    const all: Array<{
      userId: UserIdType;
      conversationId: ConversationIdType;
      type: AgentType | string;
      state: AgentState;
      agent: BaseAgent;
      sessionState: AgentSessionState;
    }> = [];

    for (const [key, agent] of this.agentInstances) {
      const [keyUserId, keyConversationId, keyType] = key.split(':');
      const sessionState = this.agentSessions.get(key);
      if (sessionState) {
        all.push({
          userId: keyUserId as UserIdType,
          conversationId: keyConversationId as ConversationIdType,
          type: keyType as AgentType | string,
          state: agent.state,
          agent,
          sessionState,
        });
      }
    }

    this.logger.debug(
      `Enumerated ${all.length} agent instances in memory`,
      AgentSessionService.name,
    );
    return all;
  }

  /**
   * Setup user interaction handling for an agent
   */
  setupUserInteractionHandling(
    agent: BaseAgent,
    sessionState: AgentSessionState,
  ): void {
    this.logger.info(
      'Setting up user interaction handling for agent',
      AgentSessionService.name,
    );
    this.logger.debug(
      `Session status: ${sessionState.status}, control options: ${JSON.stringify(sessionState.controlOptions)}`,
      AgentSessionService.name,
    );
    // This would typically set up event listeners for user interaction events
    // Implementation depends on how the agent emits user interaction events
    // For now, this is a placeholder that can be extended based on specific requirements
    this.logger.debug(
      'User interaction handling setup completed (placeholder implementation)',
      AgentSessionService.name,
    );
  }
  /**
   * Generate instance key for agent identification
   */
  private getInstanceKey(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string,
  ): string {
    return `${userId}:${conversationId}:${type}`;
  }
}
