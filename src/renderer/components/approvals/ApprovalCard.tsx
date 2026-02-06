import React, { useState } from 'react';
import { MarkdownPreview } from '../shared/MarkdownPreview';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { DecisionPayloadView } from './DecisionPayloadView';
import { Check, X, ChevronDown, ChevronRight, Clock } from 'lucide-react';

interface Approval {
  id: string;
  session_id: string;
  agent_id: string | null;
  type: string;
  summary: string;
  payload: string | null;
  status: string;
  created_at: string;
}

interface ApprovalCardProps {
  approval: Approval;
  onResolve: (id: string, status: 'approved' | 'rejected', response?: string) => void;
}

const typeBadge: Record<string, string> = {
  phase_gate: 'badge-gold',
  decision: 'badge-blue',
  merge: 'badge-ember',
  escalation: 'badge-red',
};

export function ApprovalCard({ approval, onResolve }: ApprovalCardProps): React.ReactElement {
  const [response, setResponse] = useState('');
  const isDecision = approval.type === 'decision';
  const [expanded, setExpanded] = useState(isDecision);

  let payload: Record<string, unknown> | null = null;
  if (approval.payload) {
    try {
      payload = JSON.parse(approval.payload);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card card-accent-left card-static mb-4 animate-fade-in">
      <div className="relative z-[1] p-6 pl-7">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`badge ${typeBadge[approval.type] || 'badge-neutral'}`}>
            {approval.type}
          </span>
          <span className="card-meta">
            <span className="flex items-center gap-1.5">
              <Clock size={10} strokeWidth={2} />
              {new Date(approval.created_at).toLocaleString()}
            </span>
          </span>
        </div>

        {/* Summary */}
        <div className="mb-3">
          <MarkdownPreview
            content={approval.summary}
            style={{
              fontSize: '0.8125rem',
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Decision structured view OR generic details toggle */}
        {isDecision && payload ? (
          <div className="mb-3">
            <DecisionPayloadView
              payload={payload as { question?: string; choice?: string; rationale?: string; alternatives?: string[]; tags?: string[]; decisionId?: string }}
            />
          </div>
        ) : (
          <>
            {payload && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="btn-ghost flex items-center gap-1.5 !px-0 !py-0 mb-2 text-[0.75rem]"
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {expanded ? 'Hide details' : 'Show details'}
              </button>
            )}

            {expanded && payload && (
              <pre className="p-3 bg-code-bg border border-code-border rounded-md text-[0.75rem] text-text-secondary overflow-auto max-h-[200px] mb-3 font-mono">
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}
          </>
        )}

        {/* Response editor */}
        <div className="text-[0.6875rem] text-text-tertiary mb-1.5">Response</div>
        <TransparentMarkdownEditor
          value={response}
          onChange={setResponse}
          placeholder="Optional response..."
          rows={4}
          normalTextareaClassName="input-base w-full mb-3 min-h-[88px] resize-y font-mono text-[0.8125rem] leading-relaxed"
          transparentContainerClassName="relative min-h-[100px] max-h-[180px] border border-border-default rounded-md mb-3 overflow-hidden bg-surface-2"
          transparentPreviewStyle={{
            height: '100%',
            overflow: 'auto',
            padding: 10,
            fontSize: '0.8125rem',
            lineHeight: 1.45,
          }}
          transparentTextareaStyle={{
            padding: 10,
            borderRadius: 6,
            fontSize: '0.8125rem',
            lineHeight: 1.45,
            resize: 'none',
            fontFamily: 'var(--font-mono)',
          }}
        />

        {/* Actions — the crucible moment */}
        <div className="flex gap-2">
          <button
            onClick={() => onResolve(approval.id, 'approved', response || undefined)}
            className="btn-primary flex items-center gap-1.5"
          >
            <Check size={14} />
            Approve
          </button>
          <button
            onClick={() => onResolve(approval.id, 'rejected', response || undefined)}
            className="btn-danger flex items-center gap-1.5"
          >
            <X size={14} />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
