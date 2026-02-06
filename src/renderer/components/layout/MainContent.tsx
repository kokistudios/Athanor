import React from 'react';
import type { ViewKind } from './Sidebar';
import { AgentThreadList } from '../agents/AgentThreadList';
import { SessionDashboard } from '../sessions/SessionDashboard';
import { ApprovalQueue } from '../approvals/ApprovalQueue';
import { WorkflowList } from '../workflows/WorkflowList';
import { WorkspaceDashboard } from '../workspaces/WorkspaceDashboard';
import { SpecEditor } from '../specs/SpecEditor';
import { DecisionBrowser } from '../decisions/DecisionBrowser';

export interface View {
  kind: ViewKind;
  agentId?: string;
  sessionId?: string;
  workflowId?: string;
  workspaceId?: string;
}

interface MainContentProps {
  view: View;
  onNavigate: (view: View) => void;
}

export function MainContent({ view, onNavigate }: MainContentProps): React.ReactElement {
  switch (view.kind) {
    case 'agents':
      return (
        <AgentThreadList
          selectedAgentId={view.agentId}
          onSelectAgent={(id) => onNavigate({ kind: 'agents', agentId: id })}
        />
      );
    case 'sessions':
      return (
        <SessionDashboard
          selectedSessionId={view.sessionId}
          onSelectSession={(id) => onNavigate({ kind: 'sessions', sessionId: id })}
        />
      );
    case 'approvals':
      return <ApprovalQueue />;
    case 'workflows':
      return (
        <WorkflowList
          selectedWorkflowId={view.workflowId}
          onSelectWorkflow={(id) => onNavigate({ kind: 'workflows', workflowId: id })}
        />
      );
    case 'workspaces':
      return (
        <WorkspaceDashboard
          selectedWorkspaceId={view.workspaceId}
          onSelectWorkspace={(id) => onNavigate({ kind: 'workspaces', workspaceId: id })}
        />
      );
    case 'specs':
      return <SpecEditor />;
    case 'decisions':
      return <DecisionBrowser />;
    default:
      return <div>Unknown view</div>;
  }
}
