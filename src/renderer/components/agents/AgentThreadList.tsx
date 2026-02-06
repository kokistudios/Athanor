import React, { useEffect, useState } from 'react';
import { AgentThread } from './AgentThread';
import { PanelLeftClose, PanelLeftOpen, UsersRound } from 'lucide-react';

interface Agent {
  id: string;
  session_id: string;
  phase_id: string;
  name: string;
  status: string;
  created_at: string;
}

interface AgentThreadListProps {
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
}

export function AgentThreadList({
  selectedAgentId,
  onSelectAgent,
}: AgentThreadListProps): React.ReactElement {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threadsCollapsed, setThreadsCollapsed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await window.athanor.invoke('agent:list' as never);
        setAgents(result as Agent[]);
      } catch (err) {
        console.error('Failed to load agents:', err);
      }
    }
    load();

    const cleanup = window.athanor.on('agent:status-change' as never, () => {
      load();
    });

    return cleanup;
  }, []);

  return (
    <div className="flex h-full">
      {/* Agent list panel */}
      {!threadsCollapsed && (
        <div
          style={{
            width: 240,
            minWidth: 240,
            borderRight: '1px solid var(--color-border-subtle)',
            background: 'var(--color-surface-1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px 10px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UsersRound
                size={14}
                strokeWidth={1.75}
                style={{ color: 'var(--color-accent-ember)' }}
              />
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  letterSpacing: '0.01em',
                }}
              >
                Threads
              </span>
            </div>
            <button
              onClick={() => setThreadsCollapsed(true)}
              title="Collapse thread list"
              className="btn-icon !w-6 !h-6"
            >
              <PanelLeftClose size={13} />
            </button>
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin" style={{ padding: '8px 8px' }}>
            {agents.length === 0 && (
              <div
                style={{
                  padding: '24px 12px',
                  color: 'var(--color-text-tertiary)',
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                }}
              >
                No agents running. Start a session to spawn agents.
              </div>
            )}
            <div className="flex flex-col gap-0.5 stagger-children">
              {agents.map((agent) => {
                const isSelected = selectedAgentId === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 100ms ease',
                      color: isSelected
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-secondary)',
                      background: isSelected ? 'var(--color-sidebar-active-bg)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'var(--color-sidebar-hover)';
                        e.currentTarget.style.color = 'var(--color-text-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-secondary)';
                      }
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 3,
                          height: 18,
                          borderRadius: 2,
                          background: 'var(--color-accent-ember)',
                        }}
                      />
                    )}
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{agent.name}</span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.6875rem',
                      }}
                    >
                      <span className={`status-dot status-dot-${agent.status}`} />
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{agent.status}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Thread content */}
      <div className="flex-1 relative">
        {threadsCollapsed && (
          <button
            onClick={() => setThreadsCollapsed(false)}
            title="Expand thread list"
            className="btn-icon absolute left-3 top-3 z-10"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}
        {selectedAgentId ? (
          <AgentThread agentId={selectedAgentId} />
        ) : (
          <div className="flex items-center justify-center h-full">
            {agents.length > 0 ? (
              <div className="text-text-tertiary text-[0.8125rem]">
                Select an agent thread to view
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <UsersRound size={22} strokeWidth={1.5} />
                </div>
                <div className="empty-state-title">No agent threads</div>
                <div className="empty-state-desc">
                  Start a session to spawn agents. Their conversations will appear here.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
