import type { AthanorConfig } from '../../../shared/types/config';
import type { CliAgentType } from '../../../shared/types/domain';

export interface McpServerDefinition {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface BuildSpawnSpecOptions {
  prompt: string;
  systemPrompt?: string;
  workingDir: string;
  permissionMode: string;
  allowedTools?: string[] | null;
  agents?: Record<string, unknown>;
  mcpConfigPath?: string;
  mcpServer?: McpServerDefinition;
  resumeSessionId?: string;
}

export interface CliAgentSpawnSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  initialInput?: string;
  closeStdinAfterInitialInput?: boolean;
}

export interface ParsedAssistantMessage {
  message: unknown;
  parentToolUseId?: string | null;
}

export interface CliAgentAdapter {
  readonly type: CliAgentType;
  readonly supportsInteractiveInput: boolean;
  readonly waitsForInputAfterResult: boolean;
  readonly exitsAfterTurn: boolean;

  buildSpawnSpec(opts: BuildSpawnSpecOptions, config: AthanorConfig): CliAgentSpawnSpec;
  parseStdoutLine(line: string): Record<string, unknown> | null;
  formatUserInput(input: string): string;
  extractTokenDelta(event: Record<string, unknown>): string | null;
  extractInitSessionId(event: Record<string, unknown>): string | null;
  extractAssistantMessage(event: Record<string, unknown>): ParsedAssistantMessage | null;
  extractResultMetadata(event: Record<string, unknown>): Record<string, unknown> | null;
}

export const ATHANOR_MCP_TOOL_NAMES = [
  'mcp__athanor__athanor_context',
  'mcp__athanor__athanor_record',
  'mcp__athanor__athanor_decide',
  'mcp__athanor__athanor_artifact',
  'mcp__athanor__athanor_phase_complete',
] as const;
