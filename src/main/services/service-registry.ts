import type { Kysely } from 'kysely';
import type { Database } from '../../shared/types/database';
import type { AthanorConfig } from '../../shared/types/config';
import { LocalContentStore, type ContentStore } from './content-store';
import { WorktreeManager } from './worktree-manager';
import { AgentManager, type EscalationRequest } from './agent-manager';
import { ApprovalRouter } from './approval-router';
import { WorkflowEngine } from './workflow-engine';

export interface ServiceRegistry {
  contentStore: ContentStore;
  worktreeManager: WorktreeManager;
  agentManager: AgentManager;
  approvalRouter: ApprovalRouter;
  workflowEngine: WorkflowEngine;
}

export function createServices(db: Kysely<Database>, config: AthanorConfig): ServiceRegistry {
  const contentStore = new LocalContentStore(config.storage.local.path);
  const worktreeManager = new WorktreeManager(config.storage.local.path);
  const agentManager = new AgentManager(db, contentStore, config);
  const approvalRouter = new ApprovalRouter(db);
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
      type: string;
      agent_id?: string | null;
      status: 'approved' | 'rejected';
      response?: string | null;
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
      }
    },
  );

  return {
    contentStore,
    worktreeManager,
    agentManager,
    approvalRouter,
    workflowEngine,
  };
}
