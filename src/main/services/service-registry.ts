import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { AthanorConfig } from '../../shared/types/config';
import { LocalContentStore, type ContentStore } from './content-store';
import { WorktreeManager } from './worktree-manager';
import { AgentManager, type EscalationRequest } from './agent-manager';
import { ApprovalRouter } from './approval-router';
import { WorkflowEngine } from './workflow-engine';
import { McpBridge } from './mcp-bridge';

export interface ServiceRegistry {
  contentStore: ContentStore;
  worktreeManager: WorktreeManager;
  agentManager: AgentManager;
  approvalRouter: ApprovalRouter;
  workflowEngine: WorkflowEngine;
  mcpBridge: McpBridge;
}

export function createServices(db: Kysely<Database>, config: AthanorConfig): ServiceRegistry {
  const contentStore = new LocalContentStore(config.storage.local.path);
  const worktreeManager = new WorktreeManager(config.storage.local.path);
  const agentManager = new AgentManager(db, contentStore, config);
  const approvalRouter = new ApprovalRouter(db);
  const mcpBridge = new McpBridge(db, approvalRouter);
  approvalRouter.registerBridge(mcpBridge);

  const workflowEngine = new WorkflowEngine(
    db,
    agentManager,
    approvalRouter,
    worktreeManager,
    config,
  );

  agentManager.on('agent:escalation-request', async (request: EscalationRequest) => {
    try {
      await approvalRouter.createApproval({
        sessionId: request.sessionId,
        agentId: request.agentId,
        type: 'escalation',
        summary: request.summary,
        payload: request.payload,
      });
    } catch (err) {
      console.error('Error creating escalation approval:', err);
    }
  });

  // Wire approval resolution to workflow engine
  approvalRouter.on(
    'approval:resolved',
    async (approval: {
      id: string;
      session_id: string;
      type: string;
      agent_id?: string | null;
      status: 'approved' | 'rejected';
      response?: string | null;
      payload?: string | null;
    }) => {
      if (approval.type === 'phase_gate') {
        try {
          await workflowEngine.handleApprovalResolved(approval.id);
        } catch (err) {
          console.error('Error handling approval resolution:', err);
        }
        return;
      }

      if (approval.type === 'escalation') {
        try {
          await agentManager.handleEscalationResolution({
            id: approval.id,
            agent_id: approval.agent_id || null,
            status: approval.status,
            response: approval.response || null,
          });
        } catch (err) {
          console.error('Error handling escalation resolution:', err);
        }
        return;
      }

      if (approval.type === 'decision') {
        try {
          const payload = approval.payload ? JSON.parse(approval.payload) : {};
          const decisionId = payload.decisionId as string | undefined;

          if (decisionId) {
            if (approval.status === 'rejected') {
              // Invalidate the decision
              await db
                .updateTable('decisions')
                .set({ status: 'invalidated' })
                .where('id', '=', decisionId)
                .execute();
            }
            // If approved: decision stays 'active' — no DB change needed

            // Notify the running agent with the outcome
            if (approval.agent_id) {
              const statusLabel = approval.status === 'approved' ? 'approved' : 'rejected';
              const responseText = approval.response ? `\nReviewer notes: ${approval.response}` : '';
              const prompt = `Decision ${statusLabel}: "${payload.question || decisionId}"${responseText}`;
              try {
                await agentManager.sendInput(approval.agent_id, prompt);
              } catch (err) {
                console.error(`Failed to notify agent ${approval.agent_id} of decision resolution:`, err);
              }
            }
          }
        } catch (err) {
          console.error('Error handling decision resolution:', err);
        }
      }
    },
  );

  return {
    contentStore,
    worktreeManager,
    agentManager,
    approvalRouter,
    workflowEngine,
    mcpBridge,
  };
}
