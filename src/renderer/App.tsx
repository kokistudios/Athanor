import React, { useState } from 'react';
import { Sidebar, type ViewKind } from './components/layout/Sidebar';
import { MainContent, type View } from './components/layout/MainContent';
import { useApprovals } from './hooks/useApprovals';
import { useTheme } from './hooks/useTheme';

export function App(): React.ReactElement {
  const [view, setView] = useState<View>({ kind: 'agents' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { approvals } = useApprovals();
  const { theme, toggleTheme } = useTheme();

  const handleNavigate = (kind: ViewKind) => {
    setView({ kind });
  };

  return (
    <div className="flex h-screen bg-surface-0 text-text-primary font-sans">
      <Sidebar
        currentView={view.kind}
        onNavigate={handleNavigate}
        approvalCount={approvals.length}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 overflow-hidden">
        <MainContent view={view} onNavigate={setView} />
      </main>
    </div>
  );
}
