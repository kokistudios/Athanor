import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSessions } from '../../hooks/useSessions';
import { SessionDetail } from './SessionDetail';
import { LaunchSession } from './LaunchSession';
import { Trash2, Folders, Clock, Layers, ChevronRight } from 'lucide-react';
import { secureMarkdownComponents } from '../shared/markdown-security';
import { ConfirmDialog } from '../shared/ConfirmDialog';

const statusBadgeClass: Record<string, string> = {
  active: 'badge-green',
  running: 'badge-blue',
  completed: 'badge-green',
  failed: 'badge-red',
  waiting: 'badge-gold',
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  if (selectedSessionId) {
    return <SessionDetail sessionId={selectedSessionId} onBack={() => onSelectSession('')} />;
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

          {loading && <div className="text-text-tertiary text-[0.8125rem] mt-4">Loading...</div>}

          <div className="stagger-children">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`card card-accent-left card-accent-${session.status} mb-3 group`}
              >
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="relative z-[1] flex-1 w-full p-6 pl-7 border-none bg-transparent text-left cursor-pointer text-text-primary"
                >
                  {/* Header: status + title + badges */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`status-dot status-dot-${session.status}`} />
                    <span className="card-title flex-1 min-w-0 truncate">
                      Session {session.id.slice(0, 8)}
                    </span>
                    <span
                      className={`badge ${statusBadgeClass[session.status] || 'badge-neutral'}`}
                    >
                      {statusLabel[session.status] || session.status}
                    </span>
                    {session.current_phase !== null && (
                      <span className="badge badge-ember flex items-center gap-1">
                        <Layers size={10} strokeWidth={2} />
                        Phase {session.current_phase}
                      </span>
                    )}
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity duration-150 flex-shrink-0"
                    />
                  </div>

                  {/* Context preview */}
                  {session.context && (
                    <div className="card-context-preview mb-3">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={secureMarkdownComponents}
                      >
                        {session.context}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Footer: meta info */}
                  <div className="card-meta">
                    <span className="flex items-center gap-1.5">
                      <Clock size={10} strokeWidth={2} />
                      {new Date(session.created_at).toLocaleString()}
                    </span>
                    <span className="text-text-tertiary opacity-40">|</span>
                    <span className="font-mono text-[0.625rem] text-text-tertiary opacity-50">
                      {session.id.slice(0, 12)}
                    </span>
                  </div>
                </button>

                {/* Delete action — positioned absolutely */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: session.id, label: session.id.slice(0, 8) });
                  }}
                  className="btn-icon !w-7 !h-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  title="Delete session"
                  style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Session"
        description={`Session ${deleteTarget?.label} will be permanently deleted.`}
        warning="All agents, messages, artifacts, decisions, and approvals in this session will be lost."
        onConfirm={async () => {
          if (!deleteTarget) return;
          await window.athanor.invoke('session:delete' as never, deleteTarget.id);
          setDeleteTarget(null);
          refetch();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
