import React, { useEffect, useState } from 'react';
import { DecisionDetail } from './DecisionDetail';
import { Brain, Clock, ArrowRight, ChevronRight } from 'lucide-react';

interface Decision {
  id: string;
  session_id: string;
  agent_id: string | null;
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

export function DecisionBrowser(): React.ReactElement {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const filters: Record<string, string> = {};
        if (filterStatus) filters.status = filterStatus;
        const result = await window.athanor.invoke(
          'decision:list' as never,
          Object.keys(filters).length > 0 ? filters : undefined,
        );
        setDecisions(result as Decision[]);
      } catch (err) {
        console.error('Failed to load decisions:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filterStatus]);

  const selected = decisions.find((d) => d.id === selectedId);

  if (selected) {
    return <DecisionDetail decision={selected} onBack={() => setSelectedId(null)} />;
  }

  const filtered = filterType ? decisions.filter((d) => d.type === filterType) : decisions;

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>Decisions</h2>
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-base text-[0.75rem] py-1 px-2"
          >
            <option value="">All types</option>
            <option value="decision">Decisions</option>
            <option value="finding">Findings</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-base text-[0.75rem] py-1 px-2"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invalidated">Invalidated</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        {loading && <div className="text-text-tertiary text-[0.8125rem]">Loading...</div>}

        <div className="content-area stagger-children">
          {filtered.map((decision) => {
            let tags: string[] = [];
            if (decision.tags) {
              try {
                tags = JSON.parse(decision.tags);
              } catch {
                /* ignore */
              }
            }

            const isDecision = decision.type === 'decision';

            return (
              <button
                key={decision.id}
                onClick={() => setSelectedId(decision.id)}
                className="card card-accent-left mb-3 block w-full text-left cursor-pointer group"
                style={{
                  borderLeftColor: isDecision
                    ? 'var(--color-status-running)'
                    : 'var(--color-accent-ember)',
                }}
              >
                <div className="relative z-[1] p-6 pl-7">
                  {/* Header: badges + timestamp */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`badge ${isDecision ? 'badge-blue' : 'badge-ember'}`}>
                      {decision.type}
                    </span>
                    <span
                      className={`badge ${decision.status === 'active' ? 'badge-green' : 'badge-red'}`}
                    >
                      {decision.status}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="card-meta">
                        <span className="flex items-center gap-1.5">
                          <Clock size={10} strokeWidth={2} />
                          {new Date(decision.created_at).toLocaleString()}
                        </span>
                      </span>
                      <ChevronRight
                        size={14}
                        strokeWidth={2}
                        className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity duration-150"
                      />
                    </div>
                  </div>

                  {/* Question */}
                  <div className="card-title mb-2">{decision.question}</div>

                  {/* Choice — the golden answer */}
                  <div className="flex items-center gap-2 text-[0.75rem] text-accent-gold font-medium py-1.5 px-2.5 bg-[rgba(218,178,87,0.06)] rounded-md w-fit">
                    <ArrowRight size={11} strokeWidth={2.5} className="opacity-60 flex-shrink-0" />
                    <span>{decision.choice}</span>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-3">
                      {tags.slice(0, 5).map((tag, i) => (
                        <span key={i} className="badge badge-neutral text-[0.625rem]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Brain size={22} strokeWidth={1.5} />
            </div>
            <div className="empty-state-title">No decisions recorded</div>
            <div className="empty-state-desc">
              Decisions will appear here as agents work through their phases.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
