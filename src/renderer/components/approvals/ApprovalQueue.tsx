import React, { useState } from 'react';
import { useApprovals } from '../../hooks/useApprovals';
import { ApprovalCard } from './ApprovalCard';
import { ClipboardClock, ChevronRight, ChevronDown, Clock, MessageSquare } from 'lucide-react';
import type { View } from '../layout/MainContent';

interface ApprovalQueueProps {
  onNavigate?: (view: View) => void;
}

export function ApprovalQueue({ onNavigate }: ApprovalQueueProps): React.ReactElement {
  const { groups, totalCount, loading, resolve } = useApprovals();
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());

  function toggleSession(sessionId: string) {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center gap-3">
        <ClipboardClock size={18} strokeWidth={1.75} className="text-accent-ember" />
        <h2>Approval Queue</h2>
        {totalCount > 0 && (
          <span className="badge badge-gold text-[0.625rem]">{totalCount}</span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        {loading && <div className="text-text-tertiary text-[0.8125rem]">Loading...</div>}

        {!loading && groups.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ClipboardClock size={22} strokeWidth={1.5} />
            </div>
            <div className="empty-state-title">No pending approvals</div>
            <div className="empty-state-desc">
              When agents need human oversight, approval requests will appear here.
            </div>
          </div>
        )}

        <div className="content-area">
          {groups.map((group) => {
            const isCollapsed = collapsedSessions.has(group.sessionId);
            const sessionLabel =
              group.description || `Session ${group.sessionId.slice(0, 8)}`;

            return (
              <div key={group.sessionId} className="mb-5">
                <button
                  onClick={() => toggleSession(group.sessionId)}
                  className="decision-session-header"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight size={14} strokeWidth={2} className="text-text-tertiary flex-shrink-0" />
                    ) : (
                      <ChevronDown size={14} strokeWidth={2} className="text-text-tertiary flex-shrink-0" />
                    )}
                    <span className="text-[0.8125rem] font-medium text-text-primary truncate">
                      {sessionLabel}
                    </span>
                    <span
                      className={`badge text-[0.625rem] ${
                        group.status === 'completed'
                          ? 'badge-green'
                          : group.status === 'active'
                            ? 'badge-blue'
                            : 'badge-neutral'
                      }`}
                    >
                      {group.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[0.6875rem] text-text-tertiary">
                      {group.approvals.length} approval{group.approvals.length !== 1 ? 's' : ''}
                    </span>
                    <span className="card-meta flex items-center gap-1.5">
                      <Clock size={10} strokeWidth={2} />
                      {new Date(group.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="ml-5 flex flex-col gap-4 stagger-children">
                    {group.approvals.map((approval) => {
                      const isChatType = approval.type === 'needs_input' || approval.type === 'agent_idle';
                      if (isChatType) {
                        return (
                          <div
                            key={approval.id}
                            className="card card-static card-accent-left p-6 pl-7 animate-fade-in"
                          >
                            <div className="relative z-[1] flex items-start gap-3">
                              <MessageSquare size={16} strokeWidth={1.75} className="text-accent-gold flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="text-[0.8125rem] text-text-primary leading-relaxed">
                                  {approval.summary}
                                </div>
                                <div className="text-[0.6875rem] text-text-tertiary mt-1">
                                  Respond in the agent&apos;s chat thread
                                </div>
                              </div>
                              {onNavigate && approval.agent_id && (
                                <button
                                  onClick={() => onNavigate({ kind: 'agents', agentId: approval.agent_id ?? undefined })}
                                  className="btn-secondary flex items-center gap-1.5 !py-1 !px-3 !text-[0.75rem] flex-shrink-0"
                                >
                                  Open Thread
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <ApprovalCard key={approval.id} approval={approval} onResolve={resolve} />
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
  );
}
