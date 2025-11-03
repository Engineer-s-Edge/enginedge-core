/**
 * Domain Event: Base interface for all domain events.
 * Used in Event Sourcing and Observer patterns.
 */
export interface DomainEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  timestamp: Date;
  version: number;
  data: Record<string, unknown>;
}

/**
 * IEventPublisher: Port for publishing domain events.
 *
 * Decouples domain layer from infrastructure concerns (messaging, event bus).
 * Supports event-driven architecture, audit logging, and reactive updates.
 *
 * Events flow:
 * 1. Domain entity generates event
 * 2. Use case collects events
 * 3. Publisher distributes to all subscribers
 * 4. Subscribers handle side effects (cache invalidation, notifications, etc)
 */
export interface IEventPublisher {
  /**
   * Publish a single domain event.
   * @param event The domain event to publish
   * @returns Promise<void>
   * @throws PublishException if publishing fails
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publish multiple domain events (transactionally if supported).
   * @param events Array of domain events
   * @returns Promise<void>
   * @throws PublishException if any event fails to publish
   */
  publishBatch(events: DomainEvent[]): Promise<void>;

  /**
   * Subscribe to events of a specific type.
   * @param eventType The type of event to listen for
   * @param handler Async function to execute when event published
   * @returns Unsubscribe function to remove listener
   */
  subscribe(
    eventType: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): () => void;

  /**
   * Subscribe to all events (wildcard subscription).
   * @param handler Async function executed for every published event
   * @returns Unsubscribe function to remove listener
   */
  subscribeAll(handler: (event: DomainEvent) => Promise<void>): () => void;

  /**
   * Get event history for an aggregate.
   * @param aggregateId ID of the aggregate
   * @param fromVersion Optional start version (for event sourcing)
   * @returns Promise of events in order
   */
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;

  /**
   * Clear all subscribers (for cleanup/testing).
   * @returns Promise<void>
   */
  clear(): Promise<void>;
}

export const IEventPublisher = Symbol('IEventPublisher');
