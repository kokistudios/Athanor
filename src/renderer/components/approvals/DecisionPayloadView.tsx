import React from 'react';

interface DecisionPayload {
  question?: string;
  choice?: string;
  rationale?: string;
  alternatives?: string[];
  tags?: string[];
  decisionId?: string;
}

interface DecisionPayloadViewProps {
  payload: DecisionPayload;
  compact?: boolean;
}

export function DecisionPayloadView({
  payload,
  compact = false,
}: DecisionPayloadViewProps): React.ReactElement {
  const spacing = compact ? 'mb-3' : 'mb-5';
  const textSize = compact ? 'text-[0.8125rem]' : 'text-[0.9375rem]';

  return (
    <div>
      {/* Question */}
      {payload.question && (
        <div className={`font-semibold text-text-primary ${textSize} leading-snug ${spacing}`}>
          {payload.question}
        </div>
      )}

      {/* Choice */}
      {payload.choice && (
        <div
          className={`card card-static p-4 ${spacing}`}
          style={{ borderLeft: '3px solid var(--color-accent-gold)' }}
        >
          <div className="text-[0.6875rem] font-medium text-accent-gold mb-1.5 uppercase tracking-[0.04em]">
            Choice
          </div>
          <div className={`${compact ? 'text-[0.8125rem]' : 'text-[0.875rem]'} text-text-primary leading-relaxed`}>
            {payload.choice}
          </div>
        </div>
      )}

      {/* Rationale */}
      {payload.rationale && (
        <div className={`card card-static p-4 ${spacing}`}>
          <div className="text-[0.6875rem] font-medium text-text-tertiary mb-1.5 uppercase tracking-[0.04em]">
            Rationale
          </div>
          <div className={`${compact ? 'text-[0.75rem]' : 'text-[0.875rem]'} text-text-secondary leading-relaxed`}>
            {payload.rationale}
          </div>
        </div>
      )}

      {/* Alternatives */}
      {payload.alternatives && payload.alternatives.length > 0 && (
        <div className={spacing}>
          <div className="text-[0.6875rem] font-medium text-text-tertiary mb-2 uppercase tracking-[0.04em]">
            Alternatives Considered
          </div>
          {payload.alternatives.map((alt, i) => (
            <div
              key={i}
              className={`py-2 px-3 bg-code-bg border border-code-border rounded-md mb-1.5 ${compact ? 'text-[0.75rem]' : 'text-[0.875rem]'} text-text-secondary`}
            >
              {alt}
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {payload.tags && payload.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {payload.tags.map((tag, i) => (
            <span key={i} className="badge badge-neutral">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
