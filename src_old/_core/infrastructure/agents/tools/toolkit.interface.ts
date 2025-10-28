import { ToolIdType } from '@core/infrastructure/database/utils/custom_types';
import { MIMEType } from 'util';

/**
 * Represents an invocation request from the LLM
 */
export interface ToolCall {
  name: string;
  args: any;
}

/**
 * Callback signature for user approval and query modification
 */
export interface UserApprovalCallback {
  (
    call: ToolCall,
    errorCount: number,
  ): Promise<{ approved: boolean; modifiedArgs?: any }>;
}

export interface RAGConfig {
  similarity: number;
  similarityModifiable: boolean;
  top_k: number;
  top_kModifiable: boolean;
  preretrieve?: {
    enabled: boolean;
    retrieval: 'lexical' | 'hybrid' | 'semantic';
    top_k: number;
    optimize: boolean;
    query: any[];
  };
  fileTypes?: MIMEType[];
  optimize: boolean; // Whether to try and optimize cost (may trade off accuracy)
}

/** Details of an error that occurred during tool execution */
export interface ToolError {
  name: string;
  message: string;
  guidance?: string;
  retryable: boolean;
}

/** Common fields for any tool call result */
interface BaseToolResult<Args = any> {
  call: ToolCall; // original name+args
  attempts: number; // how many tries were made
  startTime: Date; // when execution began
  endTime: Date; // when execution ended
  durationMs: number; // endTime - startTime
}

export interface ToolOutput {
  data: any;
  mimeType: MIMEType;
}

/** Successful tool execution */
export interface ToolSuccess<Args = any, Output = ToolOutput>
  extends BaseToolResult<Args> {
  success: true;
  output: Output; // the value returned by the tool
}

/** Failed tool execution */
export interface ToolFailure<Args = any> extends BaseToolResult<Args> {
  success: false;
  error: ToolError; // what went wrong
}

/** Discriminated union of success vs. failure */
export type ToolResult<Args = any, Output = ToolOutput> =
  | ToolSuccess<Args, Output>
  | ToolFailure<Args>;

export interface Tool {
  _id: ToolIdType; // unique identifier
  name: string; // unique identifier
  description: string; // human-readable overview
  type: 'actor' | 'retriever'; // literal union for IDE safety
  retrieverConfig: RAGConfig | undefined; // RAG-specific parameters
  useCase: string; // scenario in which this tool excels
  inputSchema: object; // JSON Schema for validating inputs
  outputSchema: object; // JSON Schema for validating outputs
  invocationExample: object[]; // sample invocations for in-context guidance
  retries: number; // retry count on failure
  errorEvent: Array<{
    name: string;
    guidance: string;
    retryable: boolean;
  }>; // structured error handling hooks
  parallel: boolean; // allow concurrent runs?
  concatenate: (outputs: ToolResult[]) => ToolResult; // how to combine multiple outputs
  maxIterations: number; // guardrails on loops
  pauseBeforeUse: boolean; // throttle for external calls
  userModifyQuery: boolean; // allow user to adjust inputs?
  execute: (call: ToolCall) => Promise<ToolResult>; // low-level execution method
}
