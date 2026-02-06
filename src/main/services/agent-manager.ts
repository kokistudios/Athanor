import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { ContentStore } from './content-store';
import type { AthanorConfig } from '../../shared/types/config';

export interface SpawnAgentOptions {
  sessionId: string;
  phaseId: string;
  name: string;
  prompt: string;
  systemPrompt?: string;
  worktreePath: string;
  branch?: string;
  allowedTools?: string[] | null;
  agents?: Record<string, unknown>;
  permissionMode?: string;
  claudeSessionId?: string;
  mcpConfigPath?: string;
}

export interface AgentProcess {
  id: string;
  sessionId: string;
  phaseId: string;
  name: string;
  process: ChildProcess;
  detached: boolean;
}

export interface EscalationRequest {
  agentId: string;
  sessionId: string;
  summary: string;
  payload: Record<string, unknown>;
}

export class AgentManager extends EventEmitter {
  private activeAgents = new Map<string, AgentProcess>();
  private escalationRequestKeys = new Set<string>();
  private completedAgentIds = new Set<string>();

  constructor(
    private db: Kysely<Database>,
    private contentStore: ContentStore,
    private config: AthanorConfig,
  ) {
    super();
  }

  async spawnAgent(opts: SpawnAgentOptions): Promise<string> {
    const agentId = crypto.randomUUID();

    // Insert agent row
    await this.db
      .insertInto('agents')
      .values({
        id: agentId,
        session_id: opts.sessionId,
        phase_id: opts.phaseId,
        name: opts.name,
        worktree_path: opts.worktreePath,
        branch: opts.branch || null,
        claude_session_id: opts.claudeSessionId || null,
        status: 'spawning',
      })
      .execute();

    // Build MCP config for this agent
    const mcpConfigPath = opts.mcpConfigPath || (await this.generateMcpConfig(agentId, opts));

    // Build CLI args
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
    // allowedTools handled below alongside MCP tool injection
    if (opts.agents && Object.keys(opts.agents).length > 0) {
      args.push('--agents', JSON.stringify(opts.agents));
    }
    const permissionMode =
      opts.permissionMode || this.config.claude.default_permission_mode || 'default';
    args.push('--permission-mode', permissionMode);
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    }
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath);
      // Ensure MCP tools are explicitly allowed — Claude CLI may not
      // auto-discover them even with bypassPermissions.
      const mcpToolPrefix = 'mcp__athanor__';
      const athanorTools = [
        `${mcpToolPrefix}athanor_context`,
        `${mcpToolPrefix}athanor_record`,
        `${mcpToolPrefix}athanor_decide`,
        `${mcpToolPrefix}athanor_artifact`,
        `${mcpToolPrefix}athanor_phase_complete`,
      ];
      const merged = [...(opts.allowedTools || []), ...athanorTools];
      args.push('--allowedTools', merged.join(','));
    } else if (opts.allowedTools) {
      args.push('--allowedTools', opts.allowedTools.join(','));
    }
    if (opts.claudeSessionId) {
      args.push('--resume', opts.claudeSessionId);
    }

    // Spawn the process
    const claudePath = this.config.claude.path || 'claude';
    console.log(
      `[agent:${opts.name}] Spawning: ${claudePath} ${args.slice(0, 6).join(' ')} ... (cwd: ${opts.worktreePath})`,
    );

    const detached = process.platform !== 'win32';
    const proc = spawn(claudePath, args, {
      cwd: opts.worktreePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached,
    });

    console.log(`[agent:${opts.name}] Process PID: ${proc.pid}`);

    const agentProcess: AgentProcess = {
      id: agentId,
      sessionId: opts.sessionId,
      phaseId: opts.phaseId,
      name: opts.name,
      process: proc,
      detached,
    };

    this.activeAgents.set(agentId, agentProcess);

    // Handle spawn errors (e.g. claude binary not found)
    proc.on('error', async (err) => {
      console.error(`[agent:${opts.name}] Spawn error:`, err);
      this.activeAgents.delete(agentId);
      await this.db
        .updateTable('agents')
        .set({ status: 'failed', completed_at: new Date().toISOString() })
        .where('id', '=', agentId)
        .execute();
      this.emit('agent:status-change', { agentId, status: 'failed' });
    });

    // Update status to running
    await this.db
      .updateTable('agents')
      .set({ status: 'running' })
      .where('id', '=', agentId)
      .execute();

    this.emit('agent:status-change', { agentId, status: 'running' });

    // Parse stdout
    this.setupStdoutParsing(agentId, proc, opts);

    // Kick off the phase with an explicit stream-json user message.
    try {
      await this.sendInput(agentId, opts.prompt);
    } catch (err) {
      console.error(`[agent:${opts.name}] Failed to send initial prompt:`, err);
      await this.killAgent(agentId);
      throw err;
    }

    // Handle stderr — log it for debugging
    const stderrChunks: string[] = [];
    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrChunks.push(text);
      console.error(`[agent:${opts.name}] stderr: ${text.trim()}`);
    });

    // Handle exit
    proc.on('exit', async (code, signal) => {
      console.log(`[agent:${opts.name}] Exited with code=${code} signal=${signal}`);
      if (code !== 0 && stderrChunks.length > 0) {
        console.error(`[agent:${opts.name}] Full stderr:\n${stderrChunks.join('')}`);
      }
      this.activeAgents.delete(agentId);
      await this.handleAgentExit(agentId, code);
    });

    return agentId;
  }

  private async generateMcpConfig(agentId: string, opts: SpawnAgentOptions): Promise<string> {
    const mcpConfig = {
      mcpServers: {
        athanor: {
          type: 'stdio',
          command: 'node',
          args: [path.join(process.cwd(), 'dist', 'mcp', 'mcp', 'server.js')],
          env: {
            PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
            HOME: process.env.HOME || '',
            USER: process.env.USER || '',
            ATHANOR_DB_PATH: this.config.database.sqlite.path,
            ATHANOR_AGENT_ID: agentId,
            ATHANOR_SESSION_ID: opts.sessionId,
            ATHANOR_PHASE_ID: opts.phaseId,
            ATHANOR_DATA_DIR: this.config.storage.local.path,
          },
        },
      },
    };

    const tmpDir = path.join(os.tmpdir(), 'athanor-mcp');
    await fs.mkdir(tmpDir, { recursive: true });
    const configPath = path.join(tmpDir, `${agentId}.json`);
    await fs.writeFile(configPath, JSON.stringify(mcpConfig, null, 2));
    return configPath;
  }

  private setupStdoutParsing(agentId: string, proc: ChildProcess, opts: SpawnAgentOptions): void {
    if (!proc.stdout) {
      throw new Error(`Agent ${opts.name} did not provide a stdout stream`);
    }
    const rl = readline.createInterface({ input: proc.stdout });
    const previewLen = this.config.preferences.message_preview_length;
    let lineCount = 0;

    rl.on('line', async (line) => {
      lineCount++;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line);
      } catch {
        console.log(`[agent:${opts.name}] Non-JSON line #${lineCount}: ${line.slice(0, 100)}`);
        return;
      }

      const eventType = parsed.type as string;
      console.log(`[agent:${opts.name}] Stream event #${lineCount}: type=${eventType}`);

      try {
        await this.handleStreamEvent(agentId, parsed, previewLen);
      } catch (err) {
        console.error(`[agent:${opts.name}] Error handling stream event:`, err);
      }
    });

    rl.on('close', () => {
      console.log(`[agent:${opts.name}] stdout closed after ${lineCount} lines`);
    });
  }

  private async handleStreamEvent(
    agentId: string,
    event: Record<string, unknown>,
    previewLen: number,
  ): Promise<void> {
    const type = event.type as string;
    const token = this.extractTokenDelta(event);
    if (token) {
      this.emit('agent:token', { agentId, text: token });
    }

    switch (type) {
      case 'system': {
        if ((event as { subtype?: string }).subtype === 'init') {
          const sessionId = (event as { session_id?: string }).session_id;
          if (sessionId) {
            await this.db
              .updateTable('agents')
              .set({ claude_session_id: sessionId })
              .where('id', '=', agentId)
              .execute();
          }
          this.emit('agent:init', { agentId, event });
        }
        break;
      }

      case 'stream_event': {
        await this.maybeEmitEscalationRequest(agentId, event);
        break;
      }

      case 'assistant': {
        const messageId = crypto.randomUUID();
        const message = (event as { message?: unknown }).message;
        const content = JSON.stringify(message);
        const parentToolUseId =
          (event as { parent_tool_use_id?: string }).parent_tool_use_id || null;
        const textPreview = this.extractMessageText(message);

        let contentPreview: string | null = null;
        let contentPath: string | null = null;

        if (textPreview) {
          contentPreview = textPreview.slice(0, previewLen);
        } else if (content.length <= previewLen) {
          contentPreview = content;
        } else {
          contentPreview = content.slice(0, previewLen);
        }

        if (content.length > previewLen) {
          const key = `sessions/${agentId}/messages/${messageId}.json`;
          await this.contentStore.write(key, content);
          contentPath = key;
        }

        await this.db
          .insertInto('messages')
          .values({
            id: messageId,
            agent_id: agentId,
            type: 'assistant',
            content_preview: contentPreview,
            content_path: contentPath,
            parent_tool_use_id: parentToolUseId,
          })
          .execute();

        this.emit('agent:message', { agentId, messageId, type: 'assistant', event });
        break;
      }

      case 'result': {
        const messageId = crypto.randomUUID();
        const metadata = JSON.stringify({
          total_cost_usd: (event as { total_cost_usd?: number }).total_cost_usd,
          usage: (event as { usage?: unknown }).usage,
          session_id: (event as { session_id?: string }).session_id,
        });

        await this.db
          .insertInto('messages')
          .values({
            id: messageId,
            agent_id: agentId,
            type: 'result',
            content_preview: `Cost: $${(event as { total_cost_usd?: number }).total_cost_usd?.toFixed(4) || '0'}`,
            metadata,
          })
          .execute();

        // If agent reached a terminal status (e.g. via athanor_phase_complete),
        // notify immediately and terminate the process.
        const agent = await this.db
          .selectFrom('agents')
          .select('status')
          .where('id', '=', agentId)
          .executeTakeFirst();

        if (agent && (agent.status === 'completed' || agent.status === 'failed')) {
          if (agent.status === 'completed' && !this.completedAgentIds.has(agentId)) {
            this.completedAgentIds.add(agentId);
            this.emit('agent:completed', { agentId });
          }
          this.terminateProcess(agentId);
        } else if (agent && agent.status === 'running') {
          // Agent finished its turn without calling athanor_phase_complete.
          // Set to waiting and let the user decide (via approval queue).
          await this.db
            .updateTable('agents')
            .set({ status: 'waiting' })
            .where('id', '=', agentId)
            .execute();
          this.emit('agent:status-change', { agentId, status: 'waiting' });

          // Look up the sessionId from the active agent record
          const agentRecord = await this.db
            .selectFrom('agents')
            .select('session_id')
            .where('id', '=', agentId)
            .executeTakeFirst();
          if (agentRecord) {
            this.emit('agent:turn-ended', { agentId, sessionId: agentRecord.session_id });
          }
        }
        break;
      }
    }
  }

  async handleEscalationResolution(approval: {
    id: string;
    agent_id: string | null;
    status: 'approved' | 'rejected';
    response: string | null;
  }): Promise<void> {
    if (!approval.agent_id) return;

    const statusLabel = approval.status === 'approved' ? 'approved' : 'rejected';
    const responseText = approval.response?.trim()
      ? `\nReviewer notes: ${approval.response.trim()}`
      : '';
    const guidance =
      approval.status === 'approved'
        ? 'Proceed with the requested action and report the outcome.'
        : 'Do not run the blocked action. Propose a safer alternative.';

    const prompt = `System approval update: your escalation request was ${statusLabel}.${responseText}\n${guidance}`;

    try {
      await this.sendInput(approval.agent_id, prompt);
    } catch (err) {
      console.error(`Failed to relay escalation resolution to agent ${approval.agent_id}:`, err);
    }
  }

  private async handleAgentExit(agentId: string, code: number | null): Promise<void> {
    const agent = await this.db
      .selectFrom('agents')
      .selectAll()
      .where('id', '=', agentId)
      .executeTakeFirst();

    if (!agent) return;

    let finalStatus = agent.status;

    // Only update DB if not already terminal
    if (finalStatus !== 'completed' && finalStatus !== 'failed') {
      finalStatus = code === 0 ? 'completed' : 'failed';
      await this.db
        .updateTable('agents')
        .set({
          status: finalStatus,
          completed_at: new Date().toISOString(),
        })
        .where('id', '=', agentId)
        .execute();

      this.emit('agent:status-change', { agentId, status: finalStatus });
    }

    // Notify on completion — workflow engine needs this to advance.
    // Guard: the result handler may have already emitted this.
    if (finalStatus === 'completed' && !this.completedAgentIds.has(agentId)) {
      this.completedAgentIds.add(agentId);
      this.emit('agent:completed', { agentId });
    }

    this.completedAgentIds.delete(agentId);
  }

  private terminateProcess(agentId: string): void {
    const agentProcess = this.activeAgents.get(agentId);
    if (!agentProcess) return;

    console.log(
      `[agent:${agentProcess.name}] Terminating process (agent status is terminal)`,
    );

    // Close stdin to signal no more input
    agentProcess.process.stdin?.end();

    // Give the process a moment to exit gracefully, then force-kill
    setTimeout(async () => {
      if (!this.activeAgents.has(agentId)) return; // already exited
      console.warn(`[agent:${agentProcess.name}] Still alive after stdin close; sending SIGTERM`);
      this.sendSignal(agentProcess, 'SIGTERM');

      const exited = await this.waitForExit(agentProcess.process, 3000);
      if (!exited && this.activeAgents.has(agentId)) {
        console.warn(`[agent:${agentProcess.name}] SIGTERM timeout; sending SIGKILL`);
        this.sendSignal(agentProcess, 'SIGKILL');
      }
    }, 2000);
  }

  async killAgent(agentId: string): Promise<void> {
    const agentProcess = this.activeAgents.get(agentId);
    if (agentProcess) {
      this.sendSignal(agentProcess, 'SIGTERM');
      const exited = await this.waitForExit(agentProcess.process, 1000);
      if (!exited) {
        console.warn(`[agent:${agentProcess.name}] SIGTERM timeout; forcing kill`);
        this.sendSignal(agentProcess, 'SIGKILL');
        await this.waitForExit(agentProcess.process, 1000);
      }
      this.activeAgents.delete(agentId);
    }

    await this.db
      .updateTable('agents')
      .set({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .where('id', '=', agentId)
      .execute();

    this.emit('agent:status-change', { agentId, status: 'failed' });
  }

  async sendInput(agentId: string, input: string): Promise<void> {
    const agentProcess = this.activeAgents.get(agentId);
    const stdin = agentProcess?.process.stdin;
    if (!stdin || !stdin.writable) {
      throw new Error(`Agent ${agentId} is not accepting input`);
    }
    const message: { role: 'user'; content: Array<{ type: 'text'; text: string }> } = {
      role: 'user',
      content: [{ type: 'text', text: input }],
    };
    const payload = JSON.stringify({
      type: 'user',
      message,
    });

    await new Promise<void>((resolve, reject) => {
      stdin.write(`${payload}\n`, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    await this.persistUserMessage(agentId, message);
  }

  private async persistUserMessage(
    agentId: string,
    message: { role: 'user'; content: Array<{ type: 'text'; text: string }> },
  ): Promise<void> {
    const messageId = crypto.randomUUID();
    const content = JSON.stringify(message);
    const previewLen = this.config.preferences.message_preview_length;
    const textPreview = this.extractMessageText(message);

    let contentPreview: string | null = null;
    let contentPath: string | null = null;

    if (textPreview) {
      contentPreview = textPreview.slice(0, previewLen);
    } else if (content.length <= previewLen) {
      contentPreview = content;
    } else {
      contentPreview = content.slice(0, previewLen);
    }

    if (content.length > previewLen) {
      const key = `sessions/${agentId}/messages/${messageId}.json`;
      await this.contentStore.write(key, content);
      contentPath = key;
    }

    await this.db
      .insertInto('messages')
      .values({
        id: messageId,
        agent_id: agentId,
        type: 'user',
        content_preview: contentPreview,
        content_path: contentPath,
      })
      .execute();

    this.emit('agent:message', {
      agentId,
      messageId,
      type: 'user',
      event: { type: 'user', message },
    });
  }

  private extractTokenDelta(event: Record<string, unknown>): string | null {
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

  private async maybeEmitEscalationRequest(
    agentId: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    const request = this.extractEscalationRequest(event);
    if (!request) return;

    if (this.escalationRequestKeys.has(request.requestKey)) {
      return;
    }
    this.escalationRequestKeys.add(request.requestKey);

    const agent = this.activeAgents.get(agentId);
    if (!agent) return;

    const messageId = crypto.randomUUID();
    await this.db
      .insertInto('messages')
      .values({
        id: messageId,
        agent_id: agentId,
        type: 'system',
        content_preview: request.summary,
        metadata: JSON.stringify({ escalation: request.payload }),
      })
      .execute();

    this.emit('agent:message', {
      agentId,
      messageId,
      type: 'system',
      event: { type: 'system', message: request.summary },
    });

    const escalationPayload: EscalationRequest = {
      agentId,
      sessionId: agent.sessionId,
      summary: request.summary,
      payload: request.payload,
    };
    this.emit('agent:escalation-request', escalationPayload);
  }

  private extractEscalationRequest(event: Record<string, unknown>): {
    requestKey: string;
    summary: string;
    payload: Record<string, unknown>;
  } | null {
    const nestedEvent = this.asRecord(event.event);
    const rootType = typeof event.type === 'string' ? event.type : '';
    const nestedType = nestedEvent && typeof nestedEvent.type === 'string' ? nestedEvent.type : '';
    const nestedSubtype =
      nestedEvent && typeof nestedEvent.subtype === 'string' ? nestedEvent.subtype : '';

    const typeText = `${rootType} ${nestedType} ${nestedSubtype}`.toLowerCase();
    const looksLikeEscalation =
      typeText.includes('permission') ||
      typeText.includes('approval') ||
      typeText.includes('escalat');

    if (!looksLikeEscalation) {
      return null;
    }

    const requestId =
      this.pickString(event, ['request_id', 'requestId', 'id']) ||
      this.pickString(nestedEvent, ['request_id', 'requestId', 'id']);

    const toolName =
      this.pickString(event, ['tool_name', 'toolName', 'tool']) ||
      this.pickString(nestedEvent, ['tool_name', 'toolName', 'tool']);

    const nestedInput = this.asRecord(nestedEvent?.input);
    const command =
      this.pickString(event, ['command']) ||
      this.pickString(nestedEvent, ['command']) ||
      this.pickString(nestedInput, ['command']);

    let summary = 'Agent requested elevated permissions';
    if (toolName) {
      summary = `Permission requested for tool: ${toolName}`;
    } else if (command) {
      summary = `Permission requested for command: ${command}`;
    }

    const requestKey =
      requestId || crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
    return {
      requestKey,
      summary,
      payload: {
        request_id: requestId || null,
        tool_name: toolName || null,
        command: command || null,
        raw_event: event,
      },
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private pickString(
    record: Record<string, unknown> | null | undefined,
    keys: string[],
  ): string | undefined {
    if (!record) return undefined;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return undefined;
  }

  private extractMessageText(message: unknown): string | null {
    if (!message || typeof message !== 'object') {
      return null;
    }
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return null;
    }
    const text = content
      .filter(
        (block) =>
          typeof block === 'object' &&
          block !== null &&
          (block as { type?: unknown }).type === 'text',
      )
      .map((block) => (block as { text?: unknown }).text)
      .filter((value): value is string => typeof value === 'string')
      .join('');
    return text || null;
  }

  private sendSignal(agentProcess: AgentProcess, signal: NodeJS.Signals): void {
    const pid = agentProcess.process.pid;
    if (!pid) return;

    try {
      if (agentProcess.detached && process.platform !== 'win32') {
        // Kill the process group so Claude and its MCP subprocesses stop together.
        process.kill(-pid, signal);
      } else {
        agentProcess.process.kill(signal);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        console.error(`[agent:${agentProcess.name}] Failed to send ${signal}:`, err);
      }
    }
  }

  private waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (proc.exitCode !== null) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const onExit = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.removeListener('exit', onExit);
        resolve(false);
      }, timeoutMs);
      proc.once('exit', onExit);
    });
  }

  getActiveAgents(): AgentProcess[] {
    return Array.from(this.activeAgents.values());
  }
}
