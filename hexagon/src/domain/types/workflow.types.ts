export enum WorkflowType {
  RESUME_BUILD = 'resume-build',
  EXPERT_RESEARCH = 'expert-research',
  CONVERSATION_CONTEXT = 'conversation-context',
  SINGLE_WORKER = 'single-worker',
  CUSTOM = 'custom',
}

export enum RequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum WorkerType {
  ASSISTANT = 'assistant',
  RESUME = 'resume',
  LATEX = 'latex',
  AGENT_TOOL = 'agent-tool',
  DATA_PROCESSING = 'data-processing',
  INTERVIEW = 'interview',
  SCHEDULING = 'scheduling',
  IDENTITY = 'identity',
  NEWS = 'news',
}

export enum WorkerStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export enum WorkerAssignmentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

