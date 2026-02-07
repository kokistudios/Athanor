import type { AthanorConfig } from '../../../shared/types/config';
import type {
  BuildSpawnSpecOptions,
  CliAgentAdapter,
  ParsedAssistantMessage,
} from './types';
import { ATHANOR_MCP_TOOL_NAMES } from './types';

export class CodexCliAdapter implements CliAgentAdapter {
  readonly type = 'codex' as const;
  readonly supportsInteractiveInput = false;
  readonly waitsForInputAfterResult = false;
  readonly exitsAfterTurn = true;

  buildSpawnSpec(opts: BuildSpawnSpecOptions, config: AthanorConfig) {
    const args: string[] = ['-C', opts.worktreePath];
    if (opts.resumeSessionId) {
      args.push('exec', 'resume', opts.resumeSessionId, '--json', '--skip-git-repo-check');
    } else {
      args.push('exec', '--json', '--skip-git-repo-check');
    }
    const model = config.codex.default_model;

    if (model) {
      args.push('--model', model);
    }

    // Athanor should be resilient to user-global Codex config.
    // Override unsupported legacy values like "xhigh" for gpt-5 codex models.
    if (model && model.includes('gpt-5')) {
      this.pushConfigOverride(args, 'model_reasoning_effort', this.serializeString('high'));
    }

    if (opts.permissionMode === 'bypassPermissions') {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.push('--full-auto');
    }

    if (opts.mcpServer) {
      this.pushConfigOverride(
        args,
        `mcp_servers.${opts.mcpServer.name}.command`,
        this.serializeString(opts.mcpServer.command),
      );
      this.pushConfigOverride(
        args,
        `mcp_servers.${opts.mcpServer.name}.args`,
        this.serializeArray(opts.mcpServer.args),
      );
      for (const [key, value] of Object.entries(opts.mcpServer.env)) {
        this.pushConfigOverride(
          args,
          `mcp_servers.${opts.mcpServer.name}.env.${key}`,
          this.serializeString(value),
        );
      }

      if (opts.allowedTools && opts.allowedTools.length > 0) {
        const merged = [...opts.allowedTools, ...ATHANOR_MCP_TOOL_NAMES];
        const enabledTools = Array.from(
          new Set(
            merged
              .filter((tool) => tool.startsWith('mcp__athanor__'))
              .map((tool) => tool.replace(/^mcp__athanor__/, '')),
          ),
        );

        if (enabledTools.length > 0) {
          this.pushConfigOverride(
            args,
            `mcp_servers.${opts.mcpServer.name}.enabled_tools`,
            this.serializeArray(enabledTools),
          );
        }
      }
    }

    const initialInput = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${opts.prompt}`
      : opts.prompt;

    return {
      command: config.codex.path || 'codex',
      args,
      initialInput,
      closeStdinAfterInitialInput: true,
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
    return `${input}\n`;
  }

  extractTokenDelta(event: Record<string, unknown>): string | null {
    const type = this.pickString(event, ['type']) || '';
    if (type.endsWith('_delta') && typeof event.delta === 'string') {
      return event.delta;
    }

    if (type === 'item.updated') {
      const item = this.asRecord(event.item);
      if (!item) return null;
      if (typeof item.delta === 'string') {
        return item.delta;
      }
      const deltaRecord = this.asRecord(item.delta);
      if (deltaRecord && typeof deltaRecord.text === 'string') {
        return deltaRecord.text;
      }
    }

    return null;
  }

  extractInitSessionId(event: Record<string, unknown>): string | null {
    const type = this.pickString(event, ['type']) || '';
    if (type === 'thread.started' || type === 'session.started') {
      return this.pickString(event, ['thread_id', 'session_id']) || null;
    }
    return null;
  }

  extractAssistantMessage(event: Record<string, unknown>): ParsedAssistantMessage | null {
    const type = this.pickString(event, ['type']) || '';
    if (type === 'item.completed') {
      const item = this.asRecord(event.item);
      if (!item) return null;
      const itemType = this.pickString(item, ['type']) || '';

      if (itemType === 'agent_message') {
        const text = this.extractAgentMessageText(item);
        if (!text) return null;
        return {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text }],
          },
        };
      }

      if (itemType === 'mcp_tool_call' || itemType === 'tool_call' || itemType === 'function_call') {
        const name =
          this.pickString(item, ['name', 'tool_name', 'tool']) ||
          'tool';
        const input = this.parseToolInput(item);

        return {
          message: {
            role: 'assistant',
            content: [{ type: 'server_tool_use', name, input }],
          },
        };
      }

      if (itemType === 'reasoning') {
        const thinking = this.pickString(item, ['text', 'summary', 'content']);
        if (!thinking) return null;
        return {
          message: {
            role: 'assistant',
            content: [{ type: 'thinking', thinking }],
          },
        };
      }
    }

    return null;
  }

  extractResultMetadata(event: Record<string, unknown>): Record<string, unknown> | null {
    const type = this.pickString(event, ['type']) || '';
    if (type !== 'turn.completed' && type !== 'exec.completed') {
      return null;
    }
    return {
      usage: event.usage || null,
      thread_id: this.pickString(event, ['thread_id']) || null,
      turn_id: this.pickString(event, ['turn_id']) || null,
    };
  }

  private pushConfigOverride(args: string[], key: string, value: string): void {
    args.push('-c', `${key}=${value}`);
  }

  private serializeString(value: string): string {
    return JSON.stringify(value);
  }

  private serializeArray(values: string[]): string {
    return JSON.stringify(values);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return undefined;
  }

  private extractAgentMessageText(item: Record<string, unknown>): string | null {
    const directText = this.pickString(item, ['text']);
    if (directText) return directText;

    const content = item.content;
    if (!Array.isArray(content)) {
      return null;
    }

    const text = content
      .map((block) => this.asRecord(block))
      .filter((block): block is Record<string, unknown> => !!block)
      .map((block) => {
        if (typeof block.text === 'string') return block.text;
        if (typeof block.value === 'string') return block.value;
        return '';
      })
      .filter(Boolean)
      .join('');

    return text || null;
  }

  private parseToolInput(item: Record<string, unknown>): Record<string, unknown> {
    const fromInput = this.asRecord(item.input);
    if (fromInput) return fromInput;

    const fromArgs = this.asRecord(item.arguments);
    if (fromArgs) return fromArgs;

    if (typeof item.arguments === 'string') {
      try {
        const parsed = JSON.parse(item.arguments) as unknown;
        const parsedRecord = this.asRecord(parsed);
        if (parsedRecord) return parsedRecord;
      } catch {
        // ignore malformed JSON
      }
    }

    return {};
  }
}
