import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, type ViewKind } from './components/layout/Sidebar';
import { MainContent, type View } from './components/layout/MainContent';
import { ToastContainer } from './components/shared/Toast';
import { useApprovals } from './hooks/useApprovals';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';

export function App(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: 'agents' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [waitingAgentCount, setWaitingAgentCount] = useState(0);
  const { totalCount: approvalCount } = useApprovals();
  const { theme, toggleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();

  const handleNavigate = useCallback(
    (kind: ViewKind) => {
      setView({ kind });
    },
    [],
  );

  // Track waiting agent count
  useEffect(() => {
    async function loadWaitingCount() {
      try {
        const agents = (await window.athanor.invoke('agent:list' as never)) as { status: string }[];
        setWaitingAgentCount(agents.filter((a) => a.status === 'waiting').length);
      } catch {
        // ignore
      }
    }
    loadWaitingCount();
    const cleanup = window.athanor.on('agent:status-change' as never, () => {
      loadWaitingCount();
    });
    return cleanup;
  }, []);

  // Toast on new approvals — differentiate chat vs formal
  useEffect(() => {
    const cleanup = window.athanor.on('approval:new' as never, (data: unknown) => {
      const approval = data as { type: string; summary: string; agent_id?: string };
      const isChatType = approval.type === 'needs_input' || approval.type === 'agent_idle';
      if (isChatType) {
        addToast({
          message: 'Agent awaiting response',
          variant: 'approval',
          onClick: () => setView({ kind: 'agents', agentId: approval.agent_id }),
        });
      } else {
        addToast({
          message: `New ${approval.type}: ${approval.summary}`,
          variant: 'approval',
          onClick: () => setView({ kind: 'approvals' }),
        });
      }
    });
    return cleanup;
  }, [addToast]);

  // Toast on phase advancement
  useEffect(() => {
    const cleanup = window.athanor.on('phase:advanced' as never, (data: unknown) => {
      const { phaseName, phaseNumber, totalPhases } = data as {
        sessionId: string;
        phaseName: string;
        phaseNumber: number;
        totalPhases: number;
      };
      addToast({
        message: `Phase ${phaseNumber}/${totalPhases} started: ${phaseName}`,
        variant: 'success',
        onClick: () => setView({ kind: 'sessions' }),
      });
    });
    return cleanup;
  }, [addToast]);

  // Toast on session completion
  useEffect(() => {
    const cleanup = window.athanor.on('session:status-change' as never, (data: unknown) => {
      const { status } = data as { sessionId: string; status: string };
      if (status === 'completed') {
        addToast({
          message: 'Session completed successfully',
          variant: 'success',
          onClick: () => setView({ kind: 'sessions' }),
        });
      }
    });
    return cleanup;
  }, [addToast]);

  return (
    <div className="flex h-screen bg-surface-0 text-text-primary font-sans">
      <Sidebar
        currentView={view.kind}
        onNavigate={handleNavigate}
        approvalCount={approvalCount}
        waitingAgentCount={waitingAgentCount}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 overflow-hidden">
        <MainContent view={view} onNavigate={setView} />
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
