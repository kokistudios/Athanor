import type { CliAgentType, GitBranchIsolation, PhasePermissionMode } from './domain';

export type GitStrategy =
  | { mode: 'worktree' }
  | { mode: 'main' }
  | { mode: 'branch'; branch: string; isolation: GitBranchIsolation; create: boolean };

export interface WorkflowPhaseConfig {
  permission_mode?: PhasePermissionMode;
  agent_type?: CliAgentType;
  git_strategy?: GitStrategy;
}
