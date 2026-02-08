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
import type { CliAgentType } from '../../shared/types/domain';
import { getCliAgentAdapter } from './cli-agents/registry';
import type {
  CliAgentAdapter,
  CliAgentSpawnSpec,
  McpServerDefinition,
  ParsedAssistantMessage,
} from './cli-agents/types';
import type { WorkflowPhaseConfig } from '../../shared/types/workflow-phase';

export interface SpawnAgentOptions {
  sessionId: string;
  phaseId: string;
  name: string;
  prompt: string;
  systemPrompt?: string;
  workingDir: string;
  worktreePath?: string;
  branch?: string;
  worktreeManifest?: string;
  allowedTools?: string[] | null;
  agents?: Record<string, unknown>;
  permissionMode?: string;
  agentType?: CliAgentType;
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
  agentType: CliAgentType;
  adapter: CliAgentAdapter;
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
    const agentType = opts.agentType || 'claude';
    const adapter = getCliAgentAdapter(agentType);

    // Insert agent row
    await this.db
      .insertInto('agents')
      .values({
        id: agentId,
        session_id: opts.sessionId,
        phase_id: opts.phaseId,
        name: opts.name,
        worktree_path: opts.worktreePath || null,
        branch: opts.branch || null,
        claude_session_id: opts.claudeSessionId || null,
        worktree_manifest: opts.worktreeManifest || null,
        status: 'spawning',
      })
      .execute();

    const mcpServer = this.buildAthanorMcpServer(agentId, opts);
    const mcpConfigPath = opts.mcpConfigPath || (await this.generateMcpConfig(agentId, mcpServer));
    const permissionMode = opts.permissionMode || this.config.claude.default_permission_mode || 'default';
    const spawnSpec = adapter.buildSpawnSpec(
      {
        prompt: opts.prompt,
        systemPrompt: opts.systemPrompt,
        workingDir: opts.workingDir,
        permissionMode,
        allowedTools: opts.allowedTools,
        agents: opts.agents,
        mcpConfigPath,
        mcpServer,
        resumeSessionId: opts.claudeSessionId || undefined,
      },
      this.config,
    );

    await this.launchAgentProcess({
      agentId,
      sessionId: opts.sessionId,
      phaseId: opts.phaseId,
      name: opts.name,
      workingDir: opts.workingDir,
      agentType,
      adapter,
      spawnSpec,
      initialUserInput: opts.prompt,
    });

    return agentId;
  }

  private async launchAgentProcess(opts: {
    agentId: string;
    sessionId: string;
    phaseId: string;
    name: string;
    workingDir: string;
    agentType: CliAgentType;
    adapter: CliAgentAdapter;
    spawnSpec: CliAgentSpawnSpec;
    initialUserInput?: string;
  }): Promise<void> {
    console.log(
      `[agent:${opts.name}] Spawning (${opts.agentType}): ${opts.spawnSpec.command} ${opts.spawnSpec.args.slice(0, 8).join(' ')} ... (cwd: ${opts.workingDir})`,
    );

    const detached = process.platform !== 'win32';
    const proc = spawn(opts.spawnSpec.command, opts.spawnSpec.args, {
      cwd: opts.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached,
      env: opts.spawnSpec.env ? { ...process.env, ...opts.spawnSpec.env } : process.env,
    });

    console.log(`[agent:${opts.name}] Process PID: ${proc.pid}`);

    const agentProcess: AgentProcess = {
      id: opts.agentId,
      sessionId: opts.sessionId,
      phaseId: opts.phaseId,
      name: opts.name,
      process: proc,
      detached,
      agentType: opts.agentType,
      adapter: opts.adapter,
    };

    this.activeAgents.set(opts.agentId, agentProcess);

    // Handle spawn errors (e.g. CLI binary not found)
    proc.on('error', async (err) => {
      console.error(`[agent:${opts.name}] Spawn error:`, err);
      this.activeAgents.delete(opts.agentId);
      await this.db
        .updateTable('agents')
        .set({ status: 'failed', completed_at: new Date().toISOString() })
        .where('id', '=', opts.agentId)
        .execute();
      this.emit('agent:status-change', { agentId: opts.agentId, status: 'failed' });
    });

    // Update status to running
    await this.db
      .updateTable('agents')
      .set({ status: 'running' })
      .where('id', '=', opts.agentId)
      .execute();

    this.emit('agent:status-change', { agentId: opts.agentId, status: 'running' });

    // Parse stdout
    this.setupStdoutParsing(agentProcess);

    // Send initial prompt if the adapter expects initial stdin input.
    if (opts.spawnSpec.initialInput !== undefined && opts.initialUserInput !== undefined) {
      try {
        await this.sendInputInternal(opts.agentId, opts.initialUserInput, {
          transportInput: opts.spawnSpec.initialInput,
          closeAfterWrite: opts.spawnSpec.closeStdinAfterInitialInput || false,
          bypassInteractiveCheck: true,
          persistMessage: true,
        });
      } catch (err) {
        console.error(`[agent:${opts.name}] Failed to send initial prompt:`, err);
        await this.killAgent(opts.agentId);
        throw err;
      }
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
      this.activeAgents.delete(opts.agentId);
      await this.handleAgentExit(opts.agentId, code, opts.adapter.exitsAfterTurn);
    });
  }

  private buildAthanorMcpServer(agentId: string, opts: SpawnAgentOptions): McpServerDefinition {
    return {
      name: 'athanor',
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
    };
  }

  private async generateMcpConfig(agentId: string, mcpServer: McpServerDefinition): Promise<string> {
    const mcpConfig = {
      mcpServers: {
        [mcpServer.name]: {
          type: 'stdio',
          command: mcpServer.command,
          args: mcpServer.args,
          env: mcpServer.env,
        },
      },
    };

    const tmpDir = path.join(os.tmpdir(), 'athanor-mcp');
    await fs.mkdir(tmpDir, { recursive: true });
    const configPath = path.join(tmpDir, `${agentId}.json`);
    await fs.writeFile(configPath, JSON.stringify(mcpConfig, null, 2));
    return configPath;
  }

  private setupStdoutParsing(agent: AgentProcess): void {
    if (!agent.process.stdout) {
      throw new Error(`Agent ${agent.name} did not provide a stdout stream`);
    }
    const rl = readline.createInterface({ input: agent.process.stdout });
    const previewLen = this.config.preferences.message_preview_length;
    let lineCount = 0;

    rl.on('line', async (line) => {
      lineCount++;

      const parsed = agent.adapter.parseStdoutLine(line);
      if (!parsed) {
        console.log(`[agent:${agent.name}] Non-JSON line #${lineCount}: ${line.slice(0, 120)}`);
        return;
      }

      const eventType = typeof parsed.type === 'string' ? parsed.type : 'unknown';
      console.log(`[agent:${agent.name}] Stream event #${lineCount}: type=${eventType}`);

      try {
        await this.handleStreamEvent(agent, parsed, previewLen);
      } catch (err) {
        console.error(`[agent:${agent.name}] Error handling stream event:`, err);
      }
    });

    rl.on('close', () => {
      console.log(`[agent:${agent.name}] stdout closed after ${lineCount} lines`);
    });
  }

  private async handleStreamEvent(
    agent: AgentProcess,
    event: Record<string, unknown>,
    previewLen: number,
  ): Promise<void> {
    const token = agent.adapter.extractTokenDelta(event);
    if (token) {
      this.emit('agent:token', { agentId: agent.id, text: token });
    }

    const sessionId = agent.adapter.extractInitSessionId(event);
    if (sessionId) {
      await this.db
        .updateTable('agents')
        .set({ claude_session_id: sessionId })
        .where('id', '=', agent.id)
        .execute();
      this.emit('agent:init', { agentId: agent.id, event });
    }

    await this.maybeEmitEscalationRequest(agent.id, event);

    const assistant = agent.adapter.extractAssistantMessage(event);
    if (assistant) {
      await this.persistAssistantMessage(agent.id, assistant, previewLen, event);
      return;
    }

    const resultMetadata = agent.adapter.extractResultMetadata(event);
    if (resultMetadata) {
      await this.persistResultMessage(agent.id, resultMetadata);
      await this.handleResultEvent(agent.id, agent.adapter);
    }
  }

  private async persistAssistantMessage(
    agentId: string,
    assistant: ParsedAssistantMessage,
    previewLen: number,
    rawEvent: Record<string, unknown>,
  ): Promise<void> {
    const messageId = crypto.randomUUID();
    const content = JSON.stringify(assistant.message);

    let contentPreview: string | null = null;
    let contentPath: string | null = null;

    if (content.length <= previewLen) {
      contentPreview = content;
    } else {
      contentPreview = content.slice(0, previewLen);
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
        parent_tool_use_id: assistant.parentToolUseId || null,
      })
      .execute();

    this.emit('agent:message', {
      agentId,
      messageId,
      type: 'assistant',
      event: rawEvent,
    });
  }

  private async persistResultMessage(agentId: string, metadata: Record<string, unknown>): Promise<void> {
    const messageId = crypto.randomUUID();
    const serializedMetadata = JSON.stringify(metadata);

    await this.db
      .insertInto('messages')
      .values({
        id: messageId,
        agent_id: agentId,
        type: 'result',
        content_preview: this.buildResultPreview(metadata),
        metadata: serializedMetadata,
      })
      .execute();
  }

  private buildResultPreview(metadata: Record<string, unknown>): string {
    if (typeof metadata.total_cost_usd === 'number') {
      return `Cost: $${metadata.total_cost_usd.toFixed(4)}`;
    }

    const usage = this.asRecord(metadata.usage);
    if (usage) {
      const total = usage.total_tokens;
      if (typeof total === 'number') {
        return `Usage: ${total} tokens`;
      }
      const input = usage.input_tokens;
      const output = usage.output_tokens;
      if (typeof input === 'number' || typeof output === 'number') {
        const inText = typeof input === 'number' ? input : 0;
        const outText = typeof output === 'number' ? output : 0;
        return `Usage: ${inText} in / ${outText} out`;
      }
    }

    return 'Run complete';
  }

  private async handleResultEvent(agentId: string, adapter: CliAgentAdapter): Promise<void> {
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
      return;
    }

    if (agent && agent.status === 'running' && (adapter.waitsForInputAfterResult || adapter.exitsAfterTurn)) {
      // Agent completed a turn and is ready for follow-up input.
      await this.db
        .updateTable('agents')
        .set({ status: 'waiting' })
        .where('id', '=', agentId)
        .execute();
      this.emit('agent:status-change', { agentId, status: 'waiting' });

      const agentRecord = await this.db
        .selectFrom('agents')
        .select('session_id')
        .where('id', '=', agentId)
        .executeTakeFirst();
      if (agentRecord) {
        this.emit('agent:turn-ended', { agentId, sessionId: agentRecord.session_id });
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

  private async handleAgentExit(
    agentId: string,
    code: number | null,
    preserveWaitingOnZeroExit = false,
  ): Promise<void> {
    const agent = await this.db
      .selectFrom('agents')
      .selectAll()
      .where('id', '=', agentId)
      .executeTakeFirst();

    if (!agent) return;

    let finalStatus = agent.status;

    // Only update DB if not already terminal
    if (finalStatus !== 'completed' && finalStatus !== 'failed') {
      const shouldStayWaiting =
        preserveWaitingOnZeroExit && code === 0 && finalStatus === 'waiting';

      if (!shouldStayWaiting) {
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
    if (this.activeAgents.has(agentId)) {
      await this.sendInputInternal(agentId, input, {
        persistMessage: true,
        closeAfterWrite: false,
        bypassInteractiveCheck: false,
      });
      return;
    }

    const runtime = await this.resolveAgentRuntimeForRestart(agentId);
    if (!runtime.adapter.exitsAfterTurn) {
      throw new Error(`Agent ${agentId} is not accepting input`);
    }

    const mcpServer = this.buildAthanorMcpServer(agentId, {
      sessionId: runtime.sessionId,
      phaseId: runtime.phaseId,
      name: runtime.name,
      prompt: input,
      workingDir: runtime.workingDir,
    });
    const mcpConfigPath = await this.generateMcpConfig(agentId, mcpServer);
    const spawnSpec = runtime.adapter.buildSpawnSpec(
      {
        prompt: input,
        workingDir: runtime.workingDir,
        permissionMode: runtime.permissionMode,
        allowedTools: runtime.allowedTools,
        agents: runtime.agents,
        mcpConfigPath,
        mcpServer,
        resumeSessionId: runtime.resumeSessionId,
      },
      this.config,
    );

    await this.launchAgentProcess({
      agentId,
      sessionId: runtime.sessionId,
      phaseId: runtime.phaseId,
      name: runtime.name,
      workingDir: runtime.workingDir,
      agentType: runtime.agentType,
      adapter: runtime.adapter,
      spawnSpec,
      initialUserInput: input,
    });
  }

  private async resolveAgentRuntimeForRestart(agentId: string): Promise<{
    sessionId: string;
    phaseId: string;
    name: string;
    workingDir: string;
    agentType: CliAgentType;
    adapter: CliAgentAdapter;
    permissionMode: string;
    allowedTools: string[] | null;
    agents?: Record<string, unknown>;
    resumeSessionId?: string;
  }> {
    const agent = await this.db
      .selectFrom('agents')
      .select(['id', 'session_id', 'phase_id', 'name', 'worktree_path', 'worktree_manifest', 'claude_session_id', 'status'])
      .where('id', '=', agentId)
      .executeTakeFirst();

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (agent.status !== 'waiting') {
      throw new Error(`Agent ${agentId} is not waiting for input`);
    }

    // Resolve working directory:
    // 1. worktree_manifest → parent dir (dirname of first entry)
    // 2. worktree_path → single worktree
    // 3. fall back to workspace repos (primary repo)
    let workingDir: string | null = null;

    if (agent.worktree_manifest) {
      try {
        const manifest = JSON.parse(agent.worktree_manifest) as Array<{ worktreePath: string }>;
        if (manifest.length > 0) {
          workingDir = path.dirname(manifest[0].worktreePath);
        }
      } catch {
        // ignore malformed manifest, fall through
      }
    }

    if (!workingDir && agent.worktree_path) {
      workingDir = agent.worktree_path;
    }

    if (!workingDir) {
      const session = await this.db
        .selectFrom('sessions')
        .select('workspace_id')
        .where('id', '=', agent.session_id)
        .executeTakeFirstOrThrow();

      // Try workspace_repos join table first
      const wsRepo = await this.db
        .selectFrom('workspace_repos')
        .innerJoin('repos', 'repos.id', 'workspace_repos.repo_id')
        .select('repos.local_path')
        .where('workspace_repos.workspace_id', '=', session.workspace_id)
        .orderBy('workspace_repos.ordinal', 'asc')
        .executeTakeFirst();

      if (wsRepo) {
        workingDir = wsRepo.local_path;
      } else {
        // Fall back to legacy repo_id
        const workspace = await this.db
          .selectFrom('workspaces')
          .select('repo_id')
          .where('id', '=', session.workspace_id)
          .executeTakeFirstOrThrow();
        const repo = await this.db
          .selectFrom('repos')
          .select('local_path')
          .where('id', '=', workspace.repo_id)
          .executeTakeFirstOrThrow();
        workingDir = repo.local_path;
      }
    }

    const phase = await this.db
      .selectFrom('workflow_phases')
      .select(['config', 'allowed_tools', 'agents'])
      .where('id', '=', agent.phase_id)
      .executeTakeFirst();

    let phaseConfig: WorkflowPhaseConfig = {};
    if (phase?.config) {
      try {
        phaseConfig = JSON.parse(phase.config) as WorkflowPhaseConfig;
      } catch {
        // ignore malformed phase config
      }
    }

    let allowedTools: string[] | null = null;
    if (phase?.allowed_tools) {
      try {
        const parsed = JSON.parse(phase.allowed_tools) as unknown;
        if (Array.isArray(parsed)) {
          allowedTools = parsed.filter((tool): tool is string => typeof tool === 'string');
        }
      } catch {
        // ignore malformed allowed tools
      }
    }

    let agents: Record<string, unknown> | undefined;
    if (phase?.agents) {
      try {
        const parsed = JSON.parse(phase.agents) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          agents = parsed as Record<string, unknown>;
        }
      } catch {
        // ignore malformed agents config
      }
    }

    const agentType = phaseConfig.agent_type || 'claude';
    const adapter = getCliAgentAdapter(agentType);

    return {
      sessionId: agent.session_id,
      phaseId: agent.phase_id,
      name: agent.name,
      workingDir,
      agentType,
      adapter,
      permissionMode: phaseConfig.permission_mode || 'bypassPermissions',
      allowedTools,
      agents,
      resumeSessionId: agent.claude_session_id || undefined,
    };
  }

  private async sendInputInternal(
    agentId: string,
    input: string,
    opts: {
      transportInput?: string;
      persistMessage?: boolean;
      closeAfterWrite?: boolean;
      bypassInteractiveCheck?: boolean;
    },
  ): Promise<void> {
    const agentProcess = this.activeAgents.get(agentId);
    const stdin = agentProcess?.process.stdin;
    if (!agentProcess || !stdin || !stdin.writable) {
      throw new Error(`Agent ${agentId} is not accepting input`);
    }
    if (!opts.bypassInteractiveCheck && !agentProcess.adapter.supportsInteractiveInput) {
      throw new Error(`Agent ${agentId} (${agentProcess.agentType}) does not support follow-up input`);
    }

    const transportInput = opts.transportInput ?? input;
    const payload = agentProcess.adapter.formatUserInput(transportInput);
    const message: { role: 'user'; content: Array<{ type: 'text'; text: string }> } = {
      role: 'user',
      content: [{ type: 'text', text: input }],
    };

    if (opts.closeAfterWrite) {
      await new Promise<void>((resolve, reject) => {
        stdin.write(payload, (err) => {
          if (err) {
            reject(err);
            return;
          }
          stdin.end();
          resolve();
        });
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        stdin.write(payload, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }

    if (opts.persistMessage !== false) {
      await this.persistUserMessage(agentId, message);
    }
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
    const item = this.asRecord(event.item);
    const rootType = typeof event.type === 'string' ? event.type : '';
    const nestedType = nestedEvent && typeof nestedEvent.type === 'string' ? nestedEvent.type : '';
    const nestedSubtype =
      nestedEvent && typeof nestedEvent.subtype === 'string' ? nestedEvent.subtype : '';
    const itemType = this.pickString(item, ['type']) || '';
    const itemStatus = this.pickString(item, ['status', 'state']) || '';
    const rootStatus = this.pickString(event, ['status', 'state']) || '';

    const typeText = `${rootType} ${nestedType} ${nestedSubtype} ${itemType} ${itemStatus} ${rootStatus}`.toLowerCase();
    const commandEscalation =
      (typeText.includes('command') && typeText.includes('blocked')) ||
      typeText.includes('needs_approval') ||
      typeText.includes('needs approval') ||
      typeText.includes('permission_required');
    const looksLikeEscalation =
      typeText.includes('permission') ||
      typeText.includes('approval') ||
      typeText.includes('escalat') ||
      commandEscalation;

    if (!looksLikeEscalation) {
      return null;
    }

    const requestId =
      this.pickString(event, ['request_id', 'requestId', 'id']) ||
      this.pickString(nestedEvent, ['request_id', 'requestId', 'id']) ||
      this.pickString(item, ['request_id', 'requestId', 'id']);

    const toolName =
      this.pickString(event, ['tool_name', 'toolName', 'tool']) ||
      this.pickString(nestedEvent, ['tool_name', 'toolName', 'tool']) ||
      this.pickString(item, ['tool_name', 'toolName', 'tool', 'name']);

    const nestedInput = this.asRecord(nestedEvent?.input);
    const itemInput = this.asRecord(item?.input) || this.asRecord(item?.arguments);
    const command =
      this.pickString(event, ['command']) ||
      this.pickString(nestedEvent, ['command']) ||
      this.pickString(nestedInput, ['command']) ||
      this.pickString(item, ['command']) ||
      this.pickString(itemInput, ['command']);

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
        // Kill the process group so the CLI and its MCP subprocesses stop together.
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
