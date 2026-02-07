export const SESSION_STATUSES = ['pending', 'active', 'paused', 'completed', 'failed', 'waiting_approval'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const AGENT_STATUSES = ['spawning', 'running', 'waiting', 'completed', 'failed'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const APPROVAL_TYPES = ['phase_gate', 'decision', 'merge', 'escalation', 'needs_input', 'agent_idle'] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const MESSAGE_TYPES = [
  'system',
  'assistant',
  'user',
  'tool_use',
  'tool_result',
  'stream_event',
  'result',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const PHASE_APPROVALS = ['none', 'before', 'after'] as const;
export type PhaseApproval = (typeof PHASE_APPROVALS)[number];

export const PHASE_PERMISSION_MODES = ['default', 'bypassPermissions'] as const;
export type PhasePermissionMode = (typeof PHASE_PERMISSION_MODES)[number];

export const CLI_AGENT_TYPES = ['claude', 'codex'] as const;
export type CliAgentType = (typeof CLI_AGENT_TYPES)[number];

export const DECISION_TYPES = ['decision', 'finding'] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export const DECISION_STATUSES = ['active', 'invalidated'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_ORIGINS = ['human', 'agent'] as const;
export type DecisionOrigin = (typeof DECISION_ORIGINS)[number];

export const ARTIFACT_STATUSES = ['draft', 'final'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];
