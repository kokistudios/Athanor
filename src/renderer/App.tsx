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
  const { totalCount: approvalCount } = useApprovals();
  const { theme, toggleTheme } = useTheme();
  const { toasts, addToast, dismissToast } = useToast();

  const handleNavigate = useCallback(
    (kind: ViewKind) => {
      setView({ kind });
    },
    [],
  );

  // Toast on new approvals
  useEffect(() => {
    const cleanup = window.athanor.on('approval:new' as never, (data: unknown) => {
      const approval = data as { type: string; summary: string };
      addToast({
        message: `New ${approval.type}: ${approval.summary}`,
        variant: 'approval',
        onClick: () => setView({ kind: 'approvals' }),
      });
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
