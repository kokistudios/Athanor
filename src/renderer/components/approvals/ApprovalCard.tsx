import React, { useState } from 'react';
import { MarkdownPreview } from '../shared/MarkdownPreview';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { DecisionPayloadView } from './DecisionPayloadView';
import { Check, X, ChevronDown, ChevronRight, Clock, OctagonX, PenLine, ArrowUp } from 'lucide-react';

const PHASE_TERMINATE_TEXT = [
  'DIRECTIVE: Terminate this phase now.',
  '',
  'You must immediately:',
  '1. Write your phase artifact via athanor_artifact (if not already written)',
  '2. Call athanor_phase_complete with status "complete" and a summary of what you accomplished',
  '',
  'Do not start any new work. Wrap up and complete the phase.',
].join('\n');

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
  needs_input: 'badge-violet',
  agent_idle: 'badge-violet',
};

export function ApprovalCard({ approval, onResolve }: ApprovalCardProps): React.ReactElement {
  const [response, setResponse] = useState('');
  const isDecision = approval.type === 'decision';
  const isNeedsInput = approval.type === 'needs_input';
  const isAgentIdle = approval.type === 'agent_idle';
  const isContinuation = isNeedsInput || isAgentIdle;
  const [expanded, setExpanded] = useState(isDecision);
  const [showCustomEditor, setShowCustomEditor] = useState(false);

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

        {/* Actions */}
        {isContinuation ? (
          <>
            {showCustomEditor && (
              <div className="mb-3">
                <TransparentMarkdownEditor
                  value={response}
                  onChange={setResponse}
                  onMetaEnter={() => {
                    if (response.trim()) onResolve(approval.id, 'approved', response);
                  }}
                  placeholder="Your response..."
                  rows={4}
                  normalTextareaClassName="input-base w-full min-h-[88px] resize-y font-mono text-[0.8125rem] leading-relaxed"
                  transparentContainerClassName="relative min-h-[100px] max-h-[180px] border border-border-default rounded-md overflow-hidden bg-surface-2"
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
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onResolve(approval.id, 'approved', PHASE_TERMINATE_TEXT)}
                className="btn-danger flex items-center gap-1.5"
              >
                <OctagonX size={14} />
                Phase Terminate
              </button>
              <button
                onClick={() => onResolve(approval.id, 'approved', 'Continue.')}
                className="btn-primary flex items-center gap-1.5"
              >
                <Check size={14} />
                Affirm
              </button>
              {showCustomEditor ? (
                <>
                  <button
                    onClick={() => { setShowCustomEditor(false); setResponse(''); }}
                    className="btn-ghost flex items-center gap-1.5"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                  {response.trim() && (
                    <button
                      onClick={() => onResolve(approval.id, 'approved', response)}
                      className="btn-primary flex items-center gap-1.5"
                    >
                      <ArrowUp size={14} />
                      Send
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setShowCustomEditor(true)}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <PenLine size={14} />
                  Custom
                </button>
              )}
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
