export class Request {
  constructor(
    public readonly id: string,
    public readonly type: RequestType,
    public readonly payload: any,
    public readonly metadata: RequestMetadata,
    public readonly timestamp: Date,
  ) {}

  static create(
    type: RequestType,
    payload: any,
    metadata: RequestMetadata,
  ): Request {
    return new Request(
      crypto.randomUUID(),
      type,
      payload,
      metadata,
      new Date(),
    );
  }

  isExpired(ttlMs: number): boolean {
    return Date.now() - this.timestamp.getTime() > ttlMs;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      payload: this.payload,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

export enum RequestType {
  LLM_INFERENCE = 'llm_inference',
  AGENT_TOOL_EXECUTION = 'agent_tool_execution',
  INTERVIEW_PROCESSING = 'interview_processing',
  RESUME_ANALYSIS = 'resume_analysis',
  LATEX_COMPILATION = 'latex_compilation',
  DATA_PROCESSING = 'data_processing',
  SCHEDULING = 'scheduling',
}

export interface RequestMetadata {
  userId?: string;
  sessionId?: string;
  priority?: RequestPriority;
  timeoutMs?: number;
  source?: string;
}

export enum RequestPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}
