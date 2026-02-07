import type { AthanorConfig } from '../../../shared/types/config';
import type { CliAgentAdapter, BuildSpawnSpecOptions, ParsedAssistantMessage } from './types';
import { ATHANOR_MCP_TOOL_NAMES } from './types';

export class ClaudeCliAdapter implements CliAgentAdapter {
  readonly type = 'claude' as const;
  readonly supportsInteractiveInput = true;
  readonly waitsForInputAfterResult = true;
  readonly exitsAfterTurn = false;

  buildSpawnSpec(opts: BuildSpawnSpecOptions, config: AthanorConfig) {
    const args: string[] = [
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    if (opts.systemPrompt) {
      args.push('--system-prompt', opts.systemPrompt);
    }
    if (opts.agents && Object.keys(opts.agents).length > 0) {
      args.push('--agents', JSON.stringify(opts.agents));
    }

    const permissionMode = opts.permissionMode || config.claude.default_permission_mode || 'default';
    args.push('--permission-mode', permissionMode);
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    }

    if (opts.mcpConfigPath) {
      args.push('--mcp-config', opts.mcpConfigPath);
      const merged = [...(opts.allowedTools || []), ...ATHANOR_MCP_TOOL_NAMES];
      args.push('--allowedTools', merged.join(','));
    } else if (opts.allowedTools) {
      args.push('--allowedTools', opts.allowedTools.join(','));
    }

    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId);
    }

    return {
      command: config.claude.path || 'claude',
      args,
      initialInput: opts.prompt,
      closeStdinAfterInitialInput: false,
    };
  }

  parseStdoutLine(line: string): Record<string, unknown> | null {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  formatUserInput(input: string): string {
    const message: { role: 'user'; content: Array<{ type: 'text'; text: string }> } = {
      role: 'user',
      content: [{ type: 'text', text: input }],
    };
    return `${JSON.stringify({ type: 'user', message })}\n`;
  }

  extractTokenDelta(event: Record<string, unknown>): string | null {
    const streamEvent = event.event as Record<string, unknown> | undefined;
    const rootType = event.type as string | undefined;
    const nestedType = streamEvent?.type as string | undefined;
    const deltaFromRoot = event.delta as { type?: string; text?: string } | undefined;
    const deltaFromNested = streamEvent?.delta as { type?: string; text?: string } | undefined;

    if (
      rootType === 'content_block_delta' &&
      deltaFromRoot?.type === 'text_delta' &&
      deltaFromRoot.text
    ) {
      return deltaFromRoot.text;
    }
    if (rootType === 'message_delta' && typeof (event.text as unknown) === 'string') {
      return event.text as string;
    }
    if (
      nestedType === 'content_block_delta' &&
      deltaFromNested?.type === 'text_delta' &&
      deltaFromNested.text
    ) {
      return deltaFromNested.text;
    }
    if (nestedType === 'message_delta' && typeof (streamEvent?.text as unknown) === 'string') {
      return streamEvent.text as string;
    }
    return null;
  }

  extractInitSessionId(event: Record<string, unknown>): string | null {
    if (
      event.type === 'system' &&
      (event as { subtype?: string }).subtype === 'init' &&
      typeof (event as { session_id?: unknown }).session_id === 'string'
    ) {
      return (event as { session_id: string }).session_id;
    }
    return null;
  }

  extractAssistantMessage(event: Record<string, unknown>): ParsedAssistantMessage | null {
    if (event.type !== 'assistant') {
      return null;
    }
    return {
      message: (event as { message?: unknown }).message,
      parentToolUseId:
        (event as { parent_tool_use_id?: string }).parent_tool_use_id || null,
    };
  }

  extractResultMetadata(event: Record<string, unknown>): Record<string, unknown> | null {
    if (event.type !== 'result') {
      return null;
    }
    return {
      total_cost_usd: (event as { total_cost_usd?: number }).total_cost_usd,
      usage: (event as { usage?: unknown }).usage,
      session_id: (event as { session_id?: string }).session_id,
    };
  }
}
