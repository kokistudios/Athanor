import React, { useState } from 'react';
import { useApprovals } from '../../hooks/useApprovals';
import { ApprovalCard } from './ApprovalCard';
import { ClipboardClock, ChevronRight, ChevronDown, Clock } from 'lucide-react';

export function ApprovalQueue(): React.ReactElement {
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
                  <div className="ml-5 stagger-children">
                    {group.approvals.map((approval) => (
                      <ApprovalCard key={approval.id} approval={approval} onResolve={resolve} />
                    ))}
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
