import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessions } from '../../hooks/useSessions';
import { useApprovals } from '../../hooks/useApprovals';
import { SessionDetail } from './SessionDetail';
import { LaunchSession } from './LaunchSession';
import { Folders, Clock, Layers, ChevronRight, ShieldAlert, Workflow } from 'lucide-react';
import { secureMarkdownComponents } from '../shared/markdown-security';

const statusBadgeClass: Record<string, string> = {
  active: 'badge-green',
  running: 'badge-blue',
  completed: 'badge-green',
  failed: 'badge-red',
  waiting: 'badge-gold',
  waiting_approval: 'badge-gold',
  spawning: 'badge-ember',
  paused: 'badge-neutral',
  pending: 'badge-neutral',
};

const statusLabel: Record<string, string> = {
  active: 'Active',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  waiting: 'Waiting',
  waiting_approval: 'Awaiting Approval',
  spawning: 'Spawning',
  paused: 'Paused',
  pending: 'Pending',
};

interface SessionDashboardProps {
  selectedSessionId?: string;
  onSelectSession: (id: string) => void;
}

export function SessionDashboard({
  selectedSessionId,
  onSelectSession,
}: SessionDashboardProps): React.ReactElement {
  const { sessions, loading, refetch } = useSessions();
  const { groups: approvalGroups } = useApprovals();

  // Build per-session approval counts from grouped data
  const approvalCountBySession: Record<string, number> = {};
  for (const group of approvalGroups) {
    approvalCountBySession[group.sessionId] = group.approvals.length;
  }

  if (selectedSessionId) {
    return (
      <SessionDetail
        sessionId={selectedSessionId}
        onBack={() => onSelectSession('')}
        onDeleted={() => {
          onSelectSession('');
          refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center gap-3">
        <Folders size={18} strokeWidth={1.75} className="text-accent-ember" />
        <h2>Sessions</h2>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          <LaunchSession onLaunched={refetch} />

          {loading && (
            <div className="text-text-tertiary text-[0.8125rem] mt-4">Loading...</div>
          )}

          <div className="flex flex-col gap-4 stagger-children">
            {sessions.map((session) => {
              const approvalCount = approvalCountBySession[session.id] || 0;
              const title = session.description || `Session ${session.id.slice(0, 8)}`;

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`card card-accent-left card-accent-${session.status === 'waiting_approval' ? 'waiting' : session.status} p-6 pl-7 group relative z-[1] w-full border-none bg-transparent text-left cursor-pointer text-text-primary`}
                >
                  <div className="relative z-[1]">
                    {/* Row 1: Title + Status */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`status-dot status-dot-${session.status}`} />
                      <span className="card-title flex-1 min-w-0 truncate">{title}</span>
                      <span
                        className={`badge ${statusBadgeClass[session.status] || 'badge-neutral'}`}
                      >
                        {statusLabel[session.status] || session.status}
                      </span>
                      <ChevronRight
                        size={14}
                        strokeWidth={2}
                        className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity duration-150 flex-shrink-0"
                      />
                    </div>

                    {/* Context preview */}
                    {session.context && (
                      <div className="card-context-preview mb-3 ml-5">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={secureMarkdownComponents}
                        >
                          {session.context}
                        </ReactMarkdown>
                      </div>
                    )}

                    {/* Row 2: Meta chips + timestamp */}
                    <div className="flex items-center gap-2.5 ml-5">
                      {session.workflow_name && (
                        <span className="flex items-center gap-1.5 text-[0.6875rem] text-text-tertiary">
                          <Workflow size={10} strokeWidth={2} />
                          <span className="truncate max-w-[140px]">
                            {session.workflow_name}
                          </span>
                        </span>
                      )}
                      {session.current_phase !== null && (
                        <span className="badge badge-ember flex items-center gap-1">
                          <Layers size={9} strokeWidth={2} />
                          Phase {session.current_phase + 1}
                        </span>
                      )}
                      {approvalCount > 0 && (
                        <span className="badge badge-red flex items-center gap-1">
                          <ShieldAlert size={9} strokeWidth={2} />
                          {approvalCount}
                        </span>
                      )}
                      <span className="flex-1" />
                      <span className="flex items-center gap-1.5 text-[0.6875rem] text-text-tertiary font-mono">
                        <Clock size={9} strokeWidth={2} />
                        {new Date(session.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {!loading && sessions.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Folders size={22} strokeWidth={1.5} />
              </div>
              <div className="empty-state-title">No sessions yet</div>
              <div className="empty-state-desc">
                Launch a session above to start orchestrating your AI workflow.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
