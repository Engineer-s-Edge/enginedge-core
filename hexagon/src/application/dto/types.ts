/**
 * Application Layer Type Definitions
 */

/**
 * Generic configuration object type
 * Used for agent config and memory config
 */
export interface ConfigObject {
  [key: string]:
    | string
    | number
    | boolean
    | ConfigObject
    | (string | number | boolean | ConfigObject)[];
}

/**
 * Agent execution context
 */
export interface ExecutionContext {
  [key: string]:
    | string
    | number
    | boolean
    | ExecutionContext
    | (string | number | boolean | ExecutionContext)[];
}

/**
 * Valid agent types
 */
export type AgentTypeValue =
  | 'react'
  | 'graph'
  | 'expert'
  | 'genius'
  | 'collective';

/**
 * Valid memory types
 */
export type MemoryTypeValue =
  | 'buffer'
  | 'buffer_window'
  | 'token_buffer'
  | 'summary'
  | 'summary_buffer'
  | 'entity'
  | 'knowledge_graph'
  | 'vector_store';

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Sorting parameters
 */
export interface SortParams {
  sortBy: string;
  sortDir: 'asc' | 'desc';
}
