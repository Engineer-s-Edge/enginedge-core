import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import BaseAgent from '../structures/base';
import GraphAgent from '../structures/graph';
import { AgentType, ReActAgentTypeManager } from './factory.service';
import {
  ConversationIdType,
  UserIdType,
} from '@core/infrastructure/database/utils/custom_types';
import { MyLogger } from '@core/services/logger/logger.service';

export interface AgentEventData {
  eventName: string;
  instanceKey: string;
  userId: UserIdType;
  conversationId: ConversationIdType;
  agentType: AgentType | string; // Support unique types
  data: any;
  timestamp: Date;
}

export interface AgentEventSubscriptionOptions {
  includeEventTypes?: string[];
  excludeEventTypes?: string[];
  agentType?: AgentType | string; // Support unique types
  userId?: UserIdType;
  conversationId?: ConversationIdType;
}

@Injectable()
export class AgentEventService extends EventEmitter {
  constructor(private readonly logger: MyLogger) {
    super();
    // Reasonable default to avoid unbounded listener growth in long-lived sessions
    this.setMaxListeners(100);
    this.logger.info('AgentEventService initializing', AgentEventService.name);
  }
  /**
   * Set up event forwarding from an agent instance to service consumers
   */
  setupAgentEventForwarding(
    agent: BaseAgent,
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    options?: { autoUnsubscribeMs?: number }
  ): () => void {
    this.logger.info(
      `Setting up event forwarding for agent type ${type}, user ${userId}, conversation ${conversationId}`,
      AgentEventService.name,
    );
    const instanceKey = this.getInstanceKey(userId, conversationId, type);

    // Forward all agent events with additional context
    const forwardEvent = (eventName: string) => {
      agent.on(eventName, (data: any) => {
        // this.logger.debug(
        //   `Forwarding event ${eventName} from agent ${instanceKey}`,
        //   AgentEventService.name,
        // );
        const eventData: AgentEventData = {
          eventName,
          instanceKey,
          userId,
          conversationId,
          agentType: type,
          data,
          timestamp: new Date(),
        };

        this.emit('agent-event', eventData);

        // Also emit the specific event with agent context (include eventName for subscriber convenience)
        this.emit(`agent:${eventName}`, {
          ...data,
          eventName,
          instanceKey,
          userId,
          conversationId,
          agentType: type,
        });
      });
    };

    // List of events to forward from BaseAgent
    const baseAgentEvents = [
      'agent-initializing',
      'agent-ready',
      'agent-state-changed',
      'memory-loading',
      'memory-loaded',
      'memory-assembling',
      'memory-assembled',
      'memory-switched',
      'prompt-building',
      'prompt-built',
      'prompt-token-limit-reached',
      'llm-invocation-start',
      'llm-invocation-complete',
      'llm-streaming-chunk',
      'llm-provider-switched',
      'checkpoint-creating',
      'checkpoint-created',
      'checkpoint-restoring',
      'checkpoint-restored',
      'config-updated',
      'conversation-switched',
      'operation-aborted',
      'correction-applied',
      'correction-failed',
      'error',
      'warning',
      'attachments-processing',
      'attachments-processed',
    ];

    // Additional events for GraphAgent
    const graphAgentEvents = [
      'graph-agent-initializing',
      'graph-agent-ready',
      'graph-agent-error',
      'graph-execution-start',
      'graph-execution-complete',
      'graph-execution-error',
      'graph-entry-nodes-determined',
      'graph-node-execution-start',
      'graph-node-execution-complete',
      'graph-node-execution-error',
      'graph-evaluating-edges',
      'graph-edge-traversed',
      'graph-edge-not-traversed',
      'graph-edge-execution-error',
      'graph-paused',
      'graph-resumed',
      'graph-configuration-updated',
      'graph-configuration-saved',
    ];

    // Forward base agent events
    this.logger.debug(
      `Setting up ${baseAgentEvents.length} base agent events for ${instanceKey}`,
      AgentEventService.name,
    );
  baseAgentEvents.forEach(forwardEvent);

    // Forward GraphAgent-specific events if applicable
    if (agent instanceof GraphAgent) {
      this.logger.debug(
        `Setting up ${graphAgentEvents.length} GraphAgent-specific events for ${instanceKey}`,
        AgentEventService.name,
      );
      graphAgentEvents.forEach(forwardEvent);
    } // Forward ReActAgent-specific events if applicable
    if (ReActAgentTypeManager.isReActType(type)) {
      const reactAgentEvents = [
        'react-agent-initializing',
        'react-agent-configured',
        'react-reasoning-start',
        'react-reasoning-complete',
        'react-max-steps-exceeded',
        'react-step-start',
        'react-step-complete',
        'react-thought-generating',
        'react-thought-completed',
        'react-action-planned',
        'react-tool-execution-start',
        'react-tool-execution-complete',
        'react-tool-execution-error',
        'react-observation-generated',
        'react-multi-tool-execution-complete',
        'react-observations-generated',
        'react-streaming-chunk',
        'react-final-answer',
        'react-parsing-error',
      ];
      this.logger.debug(
        `Setting up ${reactAgentEvents.length} ReActAgent-specific events for ${instanceKey}`,
        AgentEventService.name,
      );
      reactAgentEvents.forEach(forwardEvent);
    }

    this.logger.info(
      `Event forwarding setup completed for agent ${instanceKey}`,
      AgentEventService.name,
    );
    // Support auto-unsubscribe to mitigate leaks in transient sessions
    let timeout: NodeJS.Timeout | undefined;
    if (options?.autoUnsubscribeMs && options.autoUnsubscribeMs > 0) {
      timeout = setTimeout(() => {
        this.logger.info(
          `Auto-unsubscribing agent event forwarding for ${instanceKey} after ${options.autoUnsubscribeMs}ms`,
          AgentEventService.name,
        );
        agent.removeAllListeners();
      }, options.autoUnsubscribeMs).unref?.();
    }

    // Return unsubscribe function
    return () => {
      if (timeout) clearTimeout(timeout);
      agent.removeAllListeners();
      this.logger.info(
        `Event forwarding removed for agent ${instanceKey}`,
        AgentEventService.name,
      );
    };
  }

  /**
   * Remove event forwarding for an agent instance
   */
  removeAgentEventForwarding(agent: BaseAgent): void {
    this.logger.info(
      'Removing event forwarding for agent',
      AgentEventService.name,
    );
    agent.removeAllListeners();
    this.logger.debug(
      'All event listeners removed from agent',
      AgentEventService.name,
    );
  }
  /**
   * Subscribe to specific agent events for a particular agent instance
   */
  subscribeToAgentEvents(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    eventNames: string[],
    callback: (eventData: any) => void,
    options?: { autoUnsubscribeMs?: number }
  ): () => void {
    this.logger.info(
      `Subscribing to ${eventNames.length} events for agent type ${type}, user ${userId}`,
      AgentEventService.name,
    );
    this.logger.debug(
      `Event names: ${eventNames.join(', ')}`,
      AgentEventService.name,
    );
    const instanceKey = this.getInstanceKey(userId, conversationId, type);

    const listeners: Array<() => void> = [];

    eventNames.forEach((eventName) => {
      const listener = (data: any) => {
        if (data.instanceKey === instanceKey) {
          callback({
            eventName,
            agentType: type,
            userId,
            conversationId,
            data: data.data || data,
          });
        }
      };

      this.on(`agent:${eventName}`, listener);
      listeners.push(() => this.off(`agent:${eventName}`, listener));
    });

    // Auto-timeout if requested
    let timeout: NodeJS.Timeout | undefined;
    if (options?.autoUnsubscribeMs && options.autoUnsubscribeMs > 0) {
      timeout = setTimeout(() => {
        this.logger.info(
          `Auto-unsubscribing ${listeners.length} event listeners for agent ${instanceKey}`,
          AgentEventService.name,
        );
        listeners.forEach((removeListener) => removeListener());
      }, options.autoUnsubscribeMs).unref?.();
    }

    // Return unsubscribe function
    return () => {
      if (timeout) clearTimeout(timeout);
      this.logger.info(
        `Unsubscribing from ${listeners.length} event listeners for agent ${instanceKey}`,
        AgentEventService.name,
      );
      listeners.forEach((removeListener) => removeListener());
    };
  }
  /**
   * Subscribe to all events from a specific agent instance
   */
  subscribeToAgentInstance(
    userId: UserIdType,
    conversationId: ConversationIdType,
    type: AgentType | string, // Support unique types
    callback: (eventData: any) => void,
    options?: { autoUnsubscribeMs?: number }
  ): () => void {
    this.logger.info(
      `Subscribing to all events for agent type ${type}, user ${userId}`,
      AgentEventService.name,
    );
    const instanceKey = this.getInstanceKey(userId, conversationId, type);

    const listener = (data: any) => {
      if (data.instanceKey === instanceKey) {
        callback(data);
      }
    };

    this.on('agent-event', listener);

    // Auto-timeout if requested
    let timeout: NodeJS.Timeout | undefined;
    if (options?.autoUnsubscribeMs && options.autoUnsubscribeMs > 0) {
      timeout = setTimeout(() => {
        this.logger.info(
          `Auto-unsubscribing all events for agent ${instanceKey}`,
          AgentEventService.name,
        );
        this.off('agent-event', listener);
      }, options.autoUnsubscribeMs).unref?.();
    }

    // Return unsubscribe function
    return () => {
      if (timeout) clearTimeout(timeout);
      this.logger.info(
        `Unsubscribing from all events for agent ${instanceKey}`,
        AgentEventService.name,
      );
      this.off('agent-event', listener);
    };
  }
  /**
   * Subscribe to specific event types across all agents
   */
  subscribeToEventType(
    eventName: string,
    callback: (eventData: any) => void,
    filterOptions?: {
      agentType?: AgentType | string; // Support unique types
      userId?: UserIdType;
      conversationId?: ConversationIdType;
    },
    options?: { autoUnsubscribeMs?: number }
  ): () => void {
    this.logger.info(
      `Subscribing to event type ${eventName} across all agents`,
      AgentEventService.name,
    );
    if (filterOptions) {
      this.logger.debug(
        `Filter options: ${JSON.stringify(filterOptions)}`,
        AgentEventService.name,
      );
    }
    const listener = (data: any) => {
      // Apply filters if provided
      if (
        filterOptions?.agentType &&
        data.agentType !== filterOptions.agentType
      )
        return;
      if (filterOptions?.userId && data.userId !== filterOptions.userId) return;
      if (
        filterOptions?.conversationId &&
        data.conversationId !== filterOptions.conversationId
      )
        return;

      callback(data);
    };

    this.on(`agent:${eventName}`, listener);

    // Auto-timeout if requested
    let timeout: NodeJS.Timeout | undefined;
    if (options?.autoUnsubscribeMs && options.autoUnsubscribeMs > 0) {
      timeout = setTimeout(() => {
        this.logger.info(
          `Auto-unsubscribing from event type ${eventName}`,
          AgentEventService.name,
        );
        this.off(`agent:${eventName}`, listener);
      }, options.autoUnsubscribeMs).unref?.();
    }
    // Return unsubscribe function
    return () => {
      if (timeout) clearTimeout(timeout);
      this.logger.info(
        `Unsubscribing from event type ${eventName}`,
        AgentEventService.name,
      );
      this.off(`agent:${eventName}`, listener);
    };
  }

  /**
   * Get real-time agent activity stream
   */
  getAgentActivityStream(
    options?: AgentEventSubscriptionOptions,
  ): EventEmitter {
    this.logger.info('Creating agent activity stream', AgentEventService.name);
    if (options) {
      this.logger.debug(
        `Activity stream options: ${JSON.stringify(options)}`,
        AgentEventService.name,
      );
    }
    const activityStream = new EventEmitter();

    const listener = (data: any) => {
      // Apply filters
      if (options?.agentType && data.agentType !== options.agentType) return;
      if (options?.userId && data.userId !== options.userId) return;
      if (
        options?.conversationId &&
        data.conversationId !== options.conversationId
      )
        return;

      if (
        options?.includeEventTypes?.length &&
        !options.includeEventTypes.includes(data.eventName)
      )
        return;
      if (
        options?.excludeEventTypes?.length &&
        options.excludeEventTypes.includes(data.eventName)
      )
        return;

      activityStream.emit('activity', data);
    };

    this.on('agent-event', listener);

    // Clean up when activity stream is destroyed
    activityStream.on('removeListener', () => {
      this.logger.info(
        'Cleaning up activity stream listener',
        AgentEventService.name,
      );
      this.off('agent-event', listener);
    });

    this.logger.info(
      'Agent activity stream created successfully',
      AgentEventService.name,
    );
    return activityStream;
  }

  /**
   * Get event forwarding options for agent creation
   */
  getEventForwardingOptions(): {
    enableEventForwarding: boolean;
    eventFilters?: string[];
    includeRawData?: boolean;
  } {
    this.logger.info(
      'Getting event forwarding options',
      AgentEventService.name,
    );
    const options = {
      enableEventForwarding: true,
      eventFilters: [], // Empty means forward all events
      includeRawData: true,
    };
    this.logger.debug(
      `Event forwarding options: ${JSON.stringify(options)}`,
      AgentEventService.name,
    );
    return options;
  }

  /**
   * Set event filtering options
   */
  setEventFiltering(options: {
    eventFilters?: string[];
    enableEventForwarding?: boolean;
    includeRawData?: boolean;
  }): void {
    this.logger.info('Setting event filtering options', AgentEventService.name);
    this.logger.debug(
      `New filtering options: ${JSON.stringify(options)}`,
      AgentEventService.name,
    );
    // Store filtering options for future agent instances
    this.emit('event-filtering-updated', {
      options,
      timestamp: new Date(),
    });
    this.logger.info(
      'Event filtering options updated and emitted',
      AgentEventService.name,
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
