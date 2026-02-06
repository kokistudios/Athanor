import React from 'react';
import { useApprovals } from '../../hooks/useApprovals';
import { ApprovalCard } from './ApprovalCard';
import { ClipboardClock } from 'lucide-react';

export function ApprovalQueue(): React.ReactElement {
  const { approvals, loading, resolve } = useApprovals();

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center gap-3">
        <ClipboardClock size={18} strokeWidth={1.75} className="text-accent-ember" />
        <h2>Approval Queue</h2>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        {loading && <div className="text-text-tertiary text-[0.8125rem]">Loading...</div>}

        {!loading && approvals.length === 0 && (
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

        <div className="stagger-children content-area">
          {approvals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} onResolve={resolve} />
          ))}
        </div>
      </div>
    </div>
  );
}
