import React, { useEffect, useMemo, useState } from 'react';
import { AgentThread } from './AgentThread';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, UsersRound } from 'lucide-react';

interface Agent {
  id: string;
  session_id: string;
  phase_id: string;
  name: string;
  status: string;
  created_at: string;
  session_description: string | null;
  session_status: string;
  session_current_phase: number | null;
  session_total_phases: number;
  session_created_at: string;
  workflow_name: string;
}

interface SessionGroup {
  sessionId: string;
  label: string;
  status: string;
  currentPhase: number | null;
  totalPhases: number;
  agents: Agent[];
}

interface AgentThreadListProps {
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

export function AgentThreadList({
  selectedAgentId,
  onSelectAgent,
}: AgentThreadListProps): React.ReactElement {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threadsCollapsed, setThreadsCollapsed] = useState(false);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());

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

    const cleanupAgent = window.athanor.on('agent:status-change' as never, () => {
      load();
    });
    const cleanupSession = window.athanor.on('session:status-change' as never, () => {
      load();
    });
    const cleanupPhase = window.athanor.on('phase:advanced' as never, () => {
      load();
    });

    return () => {
      cleanupAgent();
      cleanupSession();
      cleanupPhase();
    };
  }, []);

  const sessionGroups = useMemo<SessionGroup[]>(() => {
    const map = new Map<string, SessionGroup>();
    for (const agent of agents) {
      let group = map.get(agent.session_id);
      if (!group) {
        group = {
          sessionId: agent.session_id,
          label: agent.session_description || agent.workflow_name || shortId(agent.session_id),
          status: agent.session_status,
          currentPhase: agent.session_current_phase,
          totalPhases: agent.session_total_phases,
          agents: [],
        };
        map.set(agent.session_id, group);
      }
      group.agents.push(agent);
    }
    return Array.from(map.values());
  }, [agents]);

  const toggleSession = (sessionId: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

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
            <div className="flex flex-col gap-1">
              {sessionGroups.map((group) => {
                const isCollapsed = collapsedSessions.has(group.sessionId);
                const hasSelectedAgent = group.agents.some((a) => a.id === selectedAgentId);
                return (
                  <div key={group.sessionId}>
                    {/* Session folder header */}
                    <button
                      onClick={() => toggleSession(group.sessionId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: 'transparent',
                        transition: 'background 100ms ease',
                        color: hasSelectedAgent
                          ? 'var(--color-text-primary)'
                          : 'var(--color-text-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-sidebar-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {isCollapsed ? (
                        <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                      ) : (
                        <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
                      )}
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          letterSpacing: '0.02em',
                          textTransform: 'uppercase',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {group.label}
                      </span>
                      {group.totalPhases > 0 && (
                        <span
                          style={{
                            fontSize: '0.5625rem',
                            fontWeight: 600,
                            color: group.status === 'completed'
                              ? 'var(--color-accent-green)'
                              : 'var(--color-accent-ember)',
                            background: group.status === 'completed'
                              ? 'color-mix(in srgb, var(--color-accent-green) 12%, transparent)'
                              : 'color-mix(in srgb, var(--color-accent-ember) 12%, transparent)',
                            padding: '1px 5px',
                            borderRadius: 3,
                            flexShrink: 0,
                          }}
                        >
                          {group.status === 'completed'
                            ? `${group.totalPhases}/${group.totalPhases}`
                            : `${(group.currentPhase ?? 0) + 1}/${group.totalPhases}`}
                        </span>
                      )}
                    </button>

                    {/* Agent list within session */}
                    {!isCollapsed && (
                      <div className="flex flex-col gap-0.5" style={{ paddingLeft: 8 }}>
                        {group.agents.map((agent) => {
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
                                padding: '8px 10px',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'all 100ms ease',
                                color: isSelected
                                  ? 'var(--color-text-primary)'
                                  : 'var(--color-text-secondary)',
                                background: isSelected
                                  ? 'var(--color-sidebar-active-bg)'
                                  : 'transparent',
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
                              <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                                {agent.name}
                              </span>
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  fontSize: '0.6875rem',
                                }}
                              >
                                <span className={`status-dot status-dot-${agent.status}`} />
                                <span style={{ color: 'var(--color-text-tertiary)' }}>
                                  {agent.status}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
