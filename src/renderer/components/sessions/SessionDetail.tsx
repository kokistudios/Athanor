import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Pause, Play, Folders } from 'lucide-react';
import { secureMarkdownComponents } from '../shared/markdown-security';

interface SessionData {
  id: string;
  status: string;
  current_phase: number | null;
  context: string | null;
  created_at: string;
  completed_at: string | null;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;
  decisions: Array<{
    id: string;
    question: string;
    choice: string;
    type: string;
    created_at: string;
  }>;
}

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps): React.ReactElement {
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const result = await window.athanor.invoke('session:get' as never, sessionId);
        setSession(result as SessionData);
      } catch (err) {
        console.error('Failed to load session:', err);
      }
    }
    load();
  }, [sessionId]);

  if (!session) {
    return <div className="p-7 text-text-tertiary text-[0.8125rem]">Loading session...</div>;
  }

  const statusBadge: Record<string, string> = {
    pending: 'badge-neutral',
    active: 'badge-blue',
    paused: 'badge-gold',
    completed: 'badge-green',
    failed: 'badge-red',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <button
          onClick={onBack}
          className="btn-ghost flex items-center gap-1.5 !px-0 !py-0 text-[0.75rem] mb-2"
        >
          <ArrowLeft size={13} />
          Back to sessions
        </button>
        <div className="flex items-center gap-3">
          <Folders size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>Session {session.id.slice(0, 8)}</h2>
          <span className={`badge ${statusBadge[session.status] || 'badge-neutral'}`}>
            {session.status}
          </span>
          {session.current_phase !== null && (
            <span className="text-[0.6875rem] text-text-tertiary">
              Phase {session.current_phase}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          {session.context && (
            <div className="card card-static p-6 mb-7">
              <div className="markdown-body text-[0.875rem]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={secureMarkdownComponents}>
                  {session.context}
                </ReactMarkdown>
              </div>
            </div>
          )}

          <div className="flex gap-7">
            {/* Agents */}
            <div className="flex-1">
              <h3 className="text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary mb-4">
                Agents
              </h3>
              <div className="stagger-children">
                {session.agents.map((agent) => (
                  <div key={agent.id} className="card card-static p-4 mb-3 flex items-center gap-4">
                    <span className={`status-dot status-dot-${agent.status}`} />
                    <div>
                      <div className="text-[0.875rem] text-text-primary font-medium">
                        {agent.name}
                      </div>
                      <div className="text-[0.75rem] text-text-tertiary mt-0.5">
                        <span
                          className={`badge ${agent.status === 'running' ? 'badge-blue' : agent.status === 'completed' ? 'badge-green' : 'badge-neutral'}`}
                        >
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {session.agents.length === 0 && (
                  <div className="text-text-tertiary text-[0.875rem]">No agents</div>
                )}
              </div>
            </div>

            {/* Decisions */}
            <div className="flex-1">
              <h3 className="text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary mb-4">
                Decisions
              </h3>
              <div className="stagger-children">
                {session.decisions.map((decision) => (
                  <div key={decision.id} className="card card-static p-4 mb-3">
                    <div className="text-[0.875rem] text-text-primary mb-2">
                      {decision.question}
                    </div>
                    <div className="markdown-body text-[0.8125rem] text-accent-gold">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={secureMarkdownComponents}
                      >
                        {decision.choice}
                      </ReactMarkdown>
                    </div>
                    <div className="mt-2">
                      <span
                        className={`badge ${decision.type === 'decision' ? 'badge-blue' : 'badge-ember'}`}
                      >
                        {decision.type}
                      </span>
                    </div>
                  </div>
                ))}
                {session.decisions.length === 0 && (
                  <div className="text-text-tertiary text-[0.875rem]">No decisions</div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-2 pb-4">
            {session.status === 'active' && (
              <button
                onClick={async () => {
                  await window.athanor.invoke('session:pause' as never, sessionId);
                  const result = await window.athanor.invoke('session:get' as never, sessionId);
                  setSession(result as SessionData);
                }}
                className="btn-secondary flex items-center gap-1.5"
              >
                <Pause size={14} />
                Pause Session
              </button>
            )}
            {session.status === 'paused' && (
              <button
                onClick={async () => {
                  await window.athanor.invoke('session:resume' as never, sessionId);
                  const result = await window.athanor.invoke('session:get' as never, sessionId);
                  setSession(result as SessionData);
                }}
                className="btn-primary flex items-center gap-1.5"
              >
                <Play size={14} />
                Resume Session
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
