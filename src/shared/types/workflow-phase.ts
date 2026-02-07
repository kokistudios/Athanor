import type { CliAgentType, PhasePermissionMode } from './domain';

export interface WorkflowPhaseConfig {
  permission_mode?: PhasePermissionMode;
  agent_type?: CliAgentType;
}
