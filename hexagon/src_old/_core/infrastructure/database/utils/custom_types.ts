import { Types } from 'mongoose';

export type ObjectIdString = string & { __objectIdBrand: never };
export function toOidString(id: Types.ObjectId): ObjectIdString {
  return id.toHexString() as ObjectIdString;
}

// Generic prefix type creator
export type PrefixedId<Prefix extends string> = `${Prefix}${ObjectIdString}`;

// Factory class for prefixed IDs
/**
 * A factory for creating, validating, and extracting prefixed IDs.
 *
 * This class provides utilities for working with MongoDB ObjectIds that have been prefixed
 * with a string identifier, creating a type-safe way to differentiate between different
 * types of IDs in the system.
 *
 * @template Prefix - A string literal type representing the prefix for IDs
 *
 * @example
 * ```typescript
 * const userIdFactory = new IdFactory('usr_');
 * const newId = userIdFactory.create(new Types.ObjectId());
 * // Result: 'usr_5f8d0c1d7c213e1d94b2e4a1'
 *
 * userIdFactory.validate('usr_5f8d0c1d7c213e1d94b2e4a1'); // true
 * userIdFactory.validate('cust_5f8d0c1d7c213e1d94b2e4a1'); // false
 *
 * const objectIdString = userIdFactory.extract('usr_5f8d0c1d7c213e1d94b2e4a1');
 * // Result: '5f8d0c1d7c213e1d94b2e4a1'
 * ```
 */
export default class IdFactory<Prefix extends string> {
  private prefix: Prefix;

  constructor(prefix: Prefix) {
    this.prefix = prefix;
  }

  create(id: Types.ObjectId): PrefixedId<Prefix> {
    return `${this.prefix}${toOidString(id)}` as PrefixedId<Prefix>;
  }

  validate(id: string): boolean {
    return id.startsWith(this.prefix);
  }

  extract(id: PrefixedId<Prefix>): ObjectIdString {
    return id.slice(this.prefix.length) as ObjectIdString;
  }
}

export type UserIdType = `u_${ObjectIdString}`;
export const UserId = new IdFactory<'u_'>('u_');
export type VectorStoreIdType = `vs_${ObjectIdString}`;
export const VectorStoreId = new IdFactory<'vs_'>('vs_');
export type ConversationIdType = `c_${ObjectIdString}`;
export const ConversationId = new IdFactory<'c_'>('c_');
export type MessageIdType = `m_${ObjectIdString}`;
export const MessageId = new IdFactory<'m_'>('m_');
export type SnippetIdType = `sn_${ObjectIdString}`;
export const SnippetId = new IdFactory<'sn_'>('sn_');
export type GraphAgentIdType = `ga_${ObjectIdString}`;
export const GraphAgentId = new IdFactory<'ga_'>('ga_');
export type ReActAgentIdType = `ra_${ObjectIdString}`;
export const ReActAgentId = new IdFactory<'ra_'>('ra_');
export type ExpertAgentIdType = `ea_${ObjectIdString}`;
export const ExpertAgentId = new IdFactory<'ea_'>('ea_');
export type GeniusAgentIdType = `gn_${ObjectIdString}`;
export const GeniusAgentId = new IdFactory<'gn_'>('gn_');
export type NodeIdType = `n_${ObjectIdString}`;
export const NodeId = new IdFactory<'n_'>('n_');
export type EdgeIdType = `e_${ObjectIdString}`;
export const EdgeId = new IdFactory<'e_'>('e_');
export type ToolIdType = `t_${ObjectIdString}`;
export const ToolId = new IdFactory<'t_'>('t_');
export type KnowledgeNodeIdType = `kn_${ObjectIdString}`;
export const KnowledgeNodeId = new IdFactory<'kn_'>('kn_');
export type KnowledgeEdgeIdType = `ke_${ObjectIdString}`;
export const KnowledgeEdgeId = new IdFactory<'ke_'>('ke_');
export type TopicIdType = `tp_${ObjectIdString}`;
export const TopicId = new IdFactory<'tp_'>('tp_');
export type EscalationIdType = `esc_${ObjectIdString}`;
export const EscalationId = new IdFactory<'esc_'>('esc_');
