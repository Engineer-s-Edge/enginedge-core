/**
 * IAgentRepository: Port for agent persistence operations.
 *
 * Defines the contract for storing and retrieving agents from persistence.
 * Implementations will handle actual storage (database, cache, etc).
 *
 * This is a key interface in Clean Architecture that separates the domain
 * from infrastructure concerns (where/how agents are persisted).
 *
 * Generic type parameter allows flexibility - implementations can use
 * their own Agent entity types (from different domains/workspaces).
 */
export interface IAgentRepository<TAgent = Record<string, unknown>> {
  /**
   * Save a new agent or update existing agent.
   * @param agent The agent domain entity to persist
   * @returns Promise of the saved agent (with any persistence-layer mutations)
   * @throws PersistenceException if save fails
   */
  save(agent: TAgent): Promise<TAgent>;

  /**
   * Find agent by ID.
   * @param id Agent ID (string identifier)
   * @returns Promise of Agent if found, null if not found
   * @throws PersistenceException if query fails
   */
  findById(id: string): Promise<TAgent | null>;

  /**
   * Find agent by name (unique constraint check).
   * @param name Agent name string
   * @returns Promise of Agent if found, null if not found
   * @throws PersistenceException if query fails
   */
  findByName(name: string): Promise<TAgent | null>;

  /**
   * List all agents with pagination and filtering.
   * @param pagination { offset: number, limit: number }
   * @param filters Optional filters { type?: AgentType, status?: AgentStatus }
   * @returns Promise of { agents: TAgent[], total: number }
   * @throws PersistenceException if query fails
   */
  findAll(
    pagination: { offset: number; limit: number },
    filters?: Record<string, string>,
  ): Promise<{ agents: TAgent[]; total: number }>;

  /**
   * Delete agent by ID (soft or hard delete per implementation).
   * @param id Agent ID
   * @returns Promise<void>
   * @throws AgentNotFoundException if agent doesn't exist
   * @throws PersistenceException if delete fails
   */
  delete(id: string): Promise<void>;

  /**
   * Check if agent exists by ID.
   * @param id Agent ID
   * @returns Promise<boolean>
   */
  exists(id: string): Promise<boolean>;

  /**
   * Batch save multiple agents (performance optimization).
   * @param agents Array of Agent entities
   * @returns Promise<TAgent[]> with persistence-layer mutations applied
   * @throws PersistenceException if batch save fails
   */
  saveBatch(agents: TAgent[]): Promise<TAgent[]>;
}

export const IAgentRepository = Symbol('IAgentRepository');
