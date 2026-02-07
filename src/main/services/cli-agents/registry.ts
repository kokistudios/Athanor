import type { CliAgentType } from '../../../shared/types/domain';
import { ClaudeCliAdapter } from './claude-cli-adapter';
import { CodexCliAdapter } from './codex-cli-adapter';
import type { CliAgentAdapter } from './types';

const adapters: Record<CliAgentType, CliAgentAdapter> = {
  claude: new ClaudeCliAdapter(),
  codex: new CodexCliAdapter(),
};

export function getCliAgentAdapter(agentType: CliAgentType): CliAgentAdapter {
  return adapters[agentType] || adapters.claude;
}
