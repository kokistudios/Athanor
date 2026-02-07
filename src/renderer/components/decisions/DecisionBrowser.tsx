import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DecisionDetail } from './DecisionDetail';
import {
  Brain,
  Clock,
  ArrowRight,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

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

interface SessionGroup {
  sessionId: string;
  description: string | null;
  status: string;
  createdAt: string;
  decisions: Decision[];
}

interface GroupedResponse {
  sessions: SessionGroup[];
  totalSessions: number;
  hasMore: boolean;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function DecisionBrowser(): React.ReactElement {
  const [sessionGroups, setSessionGroups] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadGroups = useCallback(
    async (offset: number, append: boolean) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const opts: Record<string, unknown> = { limit: 20, offset };
        if (search) opts.search = search;
        if (filterType) opts.filterType = filterType;
        if (filterStatus) opts.filterStatus = filterStatus;

        const result = (await window.athanor.invoke(
          'decision:list-grouped' as never,
          opts,
        )) as GroupedResponse;

        if (append) {
          setSessionGroups((prev) => [...prev, ...result.sessions]);
        } else {
          setSessionGroups(result.sessions);
        }
        setHasMore(result.hasMore);
      } catch (err) {
        console.error('Failed to load grouped decisions:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, filterType, filterStatus],
  );

  useEffect(() => {
    loadGroups(0, false);
  }, [loadGroups]);

  // Debounce search input
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
    }, 300);
  }

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

  function handleLoadMore() {
    loadGroups(sessionGroups.length, true);
  }

  // Callback from DecisionDetail: decision was updated
  function handleDecisionUpdated(updated: Decision) {
    setSessionGroups((prev) =>
      prev.map((group) => ({
        ...group,
        decisions: group.decisions.map((d) => (d.id === updated.id ? updated : d)),
      })),
    );
    setSelectedDecision(updated);
  }

  // Callback from DecisionDetail: decision was deleted
  function handleDecisionDeleted(id: string) {
    setSessionGroups((prev) =>
      prev
        .map((group) => ({
          ...group,
          decisions: group.decisions.filter((d) => d.id !== id),
        }))
        .filter((group) => group.decisions.length > 0),
    );
    if (selectedDecision?.id === id) {
      setSelectedDecision(null);
    }
  }

  // Detail view
  if (selectedDecision) {
    return (
      <DecisionDetail
        decision={selectedDecision}
        onBack={() => setSelectedDecision(null)}
        onUpdated={handleDecisionUpdated}
        onDeleted={handleDecisionDeleted}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>Decisions</h2>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search... (tag:file keyword:term)"
            className="input-base text-[0.75rem] py-1 px-2 w-[280px]"
          />
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

        {!loading && sessionGroups.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Brain size={22} strokeWidth={1.5} />
            </div>
            <div className="empty-state-title">No decisions recorded</div>
            <div className="empty-state-desc">
              {search
                ? 'No decisions match your search.'
                : 'Decisions will appear here as agents work through their phases.'}
            </div>
          </div>
        )}

        <div className="content-area">
          {sessionGroups.map((group) => {
            const isCollapsed = collapsedSessions.has(group.sessionId);
            const sessionLabel =
              group.description || `Session ${group.sessionId.slice(0, 8)}`;

            return (
              <div key={group.sessionId} className="mb-5">
                {/* Session group header */}
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
                      {group.decisions.length} decision{group.decisions.length !== 1 ? 's' : ''}
                    </span>
                    <span className="card-meta flex items-center gap-1.5">
                      <Clock size={10} strokeWidth={2} />
                      {new Date(group.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>

                {/* Decision cards */}
                {!isCollapsed && (
                  <div className="ml-5 flex flex-col gap-4 stagger-children">
                    {group.decisions.map((decision) => {
                      const tags = parseJsonArray(decision.tags);
                      const isDecision = decision.type === 'decision';

                      return (
                        <button
                          key={decision.id}
                          onClick={() => setSelectedDecision(decision)}
                          className="card card-accent-left p-6 pl-7 block w-full text-left cursor-pointer group"
                          style={{
                            borderLeftColor: isDecision
                              ? 'var(--color-status-running)'
                              : 'var(--color-accent-ember)',
                          }}
                        >
                          <div className="relative z-[1]">
                            {/* Header: badges + timestamp */}
                            <div className="flex items-center gap-2 mb-3">
                              <span
                                className={`badge ${isDecision ? 'badge-blue' : 'badge-ember'}`}
                              >
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

                            {/* Choice */}
                            <div className="flex items-center gap-2 text-[0.75rem] text-accent-gold font-medium py-1.5 px-2.5 bg-[rgba(218,178,87,0.06)] rounded-md w-fit">
                              <ArrowRight
                                size={11}
                                strokeWidth={2.5}
                                className="opacity-60 flex-shrink-0"
                              />
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
                )}
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <div className="flex justify-center py-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="btn-secondary text-[0.8125rem]"
            >
              {loadingMore ? 'Loading...' : 'Load more sessions'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
