import type { Generated } from 'kysely';

export interface UserTable {
  id: string;
  name: string;
  email: string | null;
  created_at: Generated<string>;
}

export interface RepoTable {
  id: string;
  name: string;
  remote_url: string | null;
  local_path: string;
  created_at: Generated<string>;
}

export interface WorkspaceTable {
  id: string;
  user_id: string;
  repo_id: string;
  name: string;
  config: string | null;
  created_at: Generated<string>;
}

export interface WorkflowTable {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WorkflowPhaseTable {
  id: string;
  workflow_id: string;
  ordinal: number;
  name: string;
  prompt_template: string;
  allowed_tools: string | null;
  agents: string | null;
  approval: Generated<string>;
  config: string | null;
}

export interface SessionTable {
  id: string;
  user_id: string;
  workspace_id: string;
  workflow_id: string;
  description: string | null;
  status: Generated<string>;
  current_phase: number | null;
  context: string | null;
  git_strategy: string | null;
  created_at: Generated<string>;
  completed_at: string | null;
}

export interface AgentTable {
  id: string;
  session_id: string;
  phase_id: string;
  name: string;
  worktree_path: string | null;
  branch: string | null;
  claude_session_id: string | null;
  status: Generated<string>;
  spawned_by: string | null;
  created_at: Generated<string>;
  completed_at: string | null;
}

export interface MessageTable {
  id: string;
  agent_id: string;
  type: string;
  content_preview: string | null;
  content_path: string | null;
  parent_tool_use_id: string | null;
  metadata: string | null;
  created_at: Generated<string>;
}

export interface ArtifactTable {
  id: string;
  session_id: string;
  phase_id: string;
  agent_id: string;
  name: string;
  file_path: string;
  status: Generated<string>;
  pinned: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface DecisionTable {
  id: string;
  session_id: string;
  agent_id: string | null;
  question: string;
  choice: string;
  alternatives: string | null;
  rationale: string;
  tags: string | null;
  type: Generated<string>;
  status: Generated<string>;
  origin: Generated<string>;
  supersedes: string | null;
  superseded_by: string | null;
  created_at: Generated<string>;
}

export interface ApprovalTable {
  id: string;
  session_id: string;
  agent_id: string | null;
  type: string;
  summary: string;
  payload: string | null;
  status: Generated<string>;
  resolved_by: string | null;
  response: string | null;
  created_at: Generated<string>;
  resolved_at: string | null;
}

export interface Database {
  users: UserTable;
  repos: RepoTable;
  workspaces: WorkspaceTable;
  workflows: WorkflowTable;
  workflow_phases: WorkflowPhaseTable;
  sessions: SessionTable;
  agents: AgentTable;
  messages: MessageTable;
  artifacts: ArtifactTable;
  decisions: DecisionTable;
  approvals: ApprovalTable;
}
