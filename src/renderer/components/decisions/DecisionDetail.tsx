import React from 'react';
import { ArrowLeft, Brain } from 'lucide-react';

interface Decision {
  id: string;
  question: string;
  choice: string;
  alternatives: string | null;
  rationale: string;
  tags: string | null;
  type: string;
  status: string;
  origin: string;
  created_at: string;
}

interface DecisionDetailProps {
  decision: Decision;
  onBack: () => void;
}

export function DecisionDetail({ decision, onBack }: DecisionDetailProps): React.ReactElement {
  let alternatives: string[] = [];
  if (decision.alternatives) {
    try {
      alternatives = JSON.parse(decision.alternatives);
    } catch {
      /* ignore */
    }
  }

  let tags: string[] = [];
  if (decision.tags) {
    try {
      tags = JSON.parse(decision.tags);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <button
          onClick={onBack}
          className="btn-ghost flex items-center gap-1.5 !px-0 !py-0 text-[0.75rem] mb-2"
        >
          <ArrowLeft size={13} />
          Back to decisions
        </button>
        <div className="flex items-center gap-3">
          <Brain size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>Decision</h2>
          <span className={`badge ${decision.type === 'decision' ? 'badge-blue' : 'badge-ember'}`}>
            {decision.type}
          </span>
          <span className={`badge ${decision.status === 'active' ? 'badge-green' : 'badge-red'}`}>
            {decision.status}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          <div className="text-[0.75rem] text-text-tertiary mb-4">
            {decision.origin} &middot; {new Date(decision.created_at).toLocaleString()}
          </div>

          <h3 className="text-text-primary text-[1.125rem] font-semibold mb-6 leading-snug">
            {decision.question}
          </h3>

          {/* Choice */}
          <div
            className="card card-static p-6 mb-5"
            style={{ borderLeft: '3px solid var(--color-accent-gold)' }}
          >
            <div className="text-[0.75rem] font-medium text-accent-gold mb-2 uppercase tracking-[0.04em]">
              Choice
            </div>
            <div className="text-[0.9375rem] text-text-primary leading-relaxed">
              {decision.choice}
            </div>
          </div>

          {/* Rationale */}
          <div className="card card-static p-6 mb-5">
            <div className="text-[0.75rem] font-medium text-text-tertiary mb-2 uppercase tracking-[0.04em]">
              Rationale
            </div>
            <div className="text-[0.875rem] text-text-secondary leading-relaxed">
              {decision.rationale}
            </div>
          </div>

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <div className="card card-static p-6 mb-5">
              <div className="text-[0.75rem] font-medium text-text-tertiary mb-3 uppercase tracking-[0.04em]">
                Alternatives Considered
              </div>
              {alternatives.map((alt, i) => (
                <div
                  key={i}
                  className="py-2.5 px-4 bg-code-bg border border-code-border rounded-md mb-2 text-[0.875rem] text-text-secondary"
                >
                  {alt}
                </div>
              ))}
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex gap-2 flex-wrap pb-4">
              {tags.map((tag, i) => (
                <span key={i} className="badge badge-neutral">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
