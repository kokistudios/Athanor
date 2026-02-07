import React, { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Pause,
  Play,
  Folders,
  ShieldAlert,
  Pin,
  PinOff,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  Bot,
  Lightbulb,
  MessageSquareText,
  Clock,
} from 'lucide-react';
import { secureMarkdownComponents } from '../shared/markdown-security';
import { ApprovalCard } from '../approvals/ApprovalCard';
import { useApprovals } from '../../hooks/useApprovals';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface SessionData {
  id: string;
  status: string;
  description: string | null;
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
  artifacts: Array<{
    id: string;
    name: string;
    file_path: string;
    status: string;
    pinned: number;
    created_at: string;
    phase_id: string;
  }>;
}

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
  onDeleted?: () => void;
}

const statusBadge: Record<string, string> = {
  pending: 'badge-neutral',
  active: 'badge-blue',
  paused: 'badge-gold',
  completed: 'badge-green',
  failed: 'badge-red',
  waiting_approval: 'badge-gold',
};

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  waiting_approval: 'Awaiting Approval',
};

const agentStatusBadge: Record<string, string> = {
  spawning: 'badge-ember',
  running: 'badge-blue',
  waiting: 'badge-gold',
  completed: 'badge-green',
  failed: 'badge-red',
};

function computeTtl(createdAt: string): { label: string; urgent: boolean } {
  const expiresAt = new Date(createdAt).getTime() + 7 * 24 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { label: 'Expired', urgent: true };
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return { label: `Expires in ${days}d`, urgent: days < 2 };
}

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <Icon size={13} strokeWidth={2} className="text-accent-ember" />
      <h3 className="text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary">
        {label}
      </h3>
      {count !== undefined && count > 0 && (
        <span className="text-[0.625rem] font-mono text-text-tertiary opacity-60">
          {count}
        </span>
      )}
    </div>
  );
}

function ArtifactCard({
  artifact,
  onTogglePin,
  onDelete,
}: {
  artifact: SessionData['artifacts'][number];
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExpand = useCallback(async () => {
    if (!expanded && content === null) {
      setLoading(true);
      try {
        const result = await window.athanor.invoke('artifact:read' as never, artifact.id);
        setContent((result as string) || '');
      } catch {
        setContent('Failed to load artifact content.');
      } finally {
        setLoading(false);
      }
    }
    setExpanded((prev) => !prev);
  }, [expanded, content, artifact.id]);

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete artifact "${artifact.name}"? This cannot be undone.`)) {
      onDelete(artifact.id);
    }
  }, [artifact.id, artifact.name, onDelete]);

  const isPinned = artifact.pinned === 1;
  const ttl = isPinned ? null : computeTtl(artifact.created_at);

  return (
    <div className="card card-static card-flush">
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer select-none"
        onClick={handleExpand}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-text-tertiary flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-tertiary flex-shrink-0" />
        )}
        <FileText size={14} strokeWidth={1.75} className="text-accent-ember flex-shrink-0" />
        <span className="text-[0.8125rem] text-text-primary font-medium flex-1 truncate">
          {artifact.name}
        </span>
        {isPinned ? (
          <span className="badge badge-ember">Pinned</span>
        ) : (
          ttl && (
            <span
              className="text-[0.6875rem]"
              style={{
                color: ttl.urgent
                  ? 'var(--color-status-failed)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              {ttl.label}
            </span>
          )
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(artifact.id);
          }}
          className="btn-ghost !p-1"
          title={isPinned ? 'Unpin artifact' : 'Pin artifact'}
        >
          {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="btn-ghost !p-1 text-status-failed"
          title="Delete artifact"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {expanded && (
        <div className="px-5 pb-5 border-t border-border-subtle pt-4">
          {loading ? (
            <div className="text-text-tertiary text-[0.8125rem]">Loading...</div>
          ) : (
            <div className="markdown-body text-[0.875rem]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={secureMarkdownComponents}
              >
                {content || ''}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SessionDetail({
  sessionId,
  onBack,
  onDeleted,
}: SessionDetailProps): React.ReactElement {
  const [session, setSession] = useState<SessionData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { groups: approvalGroups, resolve } = useApprovals();

  const sessionApprovals =
    approvalGroups.find((g) => g.sessionId === sessionId)?.approvals || [];

  const reloadSession = useCallback(async () => {
    try {
      const result = await window.athanor.invoke('session:get' as never, sessionId);
      setSession(result as SessionData);
    } catch (err) {
      console.error('Failed to reload session:', err);
    }
  }, [sessionId]);

  const handleTogglePin = useCallback(
    async (artifactId: string) => {
      await window.athanor.invoke('artifact:toggle-pin' as never, artifactId);
      await reloadSession();
    },
    [reloadSession],
  );

  const handleDeleteArtifact = useCallback(
    async (artifactId: string) => {
      await window.athanor.invoke('artifact:delete' as never, artifactId);
      await reloadSession();
    },
    [reloadSession],
  );

  const handleDeleteSession = useCallback(async () => {
    await window.athanor.invoke('session:delete' as never, sessionId);
    setShowDeleteConfirm(false);
    onDeleted?.();
  }, [sessionId, onDeleted]);

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

    const cleanupStatus = window.athanor.on(
      'session:status-change' as never,
      (data: unknown) => {
        const { sessionId: changedId } = data as { sessionId: string };
        if (changedId === sessionId) {
          load();
        }
      },
    );

    return cleanupStatus;
  }, [sessionId]);

  if (!session) {
    return (
      <div className="p-7 text-text-tertiary text-[0.8125rem]">Loading session...</div>
    );
  }

  const title = session.description || `Session ${session.id.slice(0, 8)}`;

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
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
          <h2>{title}</h2>
          <span className={`badge ${statusBadge[session.status] || 'badge-neutral'}`}>
            {statusLabel[session.status] || session.status}
          </span>
          {sessionApprovals.length > 0 && (
            <span className="badge badge-red flex items-center gap-1">
              <ShieldAlert size={10} strokeWidth={2} />
              Blocked
            </span>
          )}
          {session.current_phase !== null && (
            <span className="text-[0.6875rem] text-text-tertiary font-mono">
              Phase {session.current_phase + 1}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-ghost flex items-center gap-1.5 text-status-failed"
            >
              <Trash2 size={13} strokeWidth={2} />
              <span className="text-[0.75rem]">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          {/* Session metadata bar */}
          <div className="flex items-center gap-4 mb-8 text-[0.6875rem] text-text-tertiary font-mono">
            <span className="flex items-center gap-1.5">
              <Clock size={10} strokeWidth={2} />
              Created {new Date(session.created_at).toLocaleString()}
            </span>
            {session.completed_at && (
              <span className="flex items-center gap-1.5">
                Completed {new Date(session.completed_at).toLocaleString()}
              </span>
            )}
            <span className="opacity-40">{session.id.slice(0, 12)}</span>
          </div>

          {/* Context */}
          {session.context && (
            <div className="mb-10">
              <SectionHeader icon={MessageSquareText} label="Context" />
              <div className="card card-static p-6">
                <div className="markdown-body text-[0.875rem]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={secureMarkdownComponents}
                  >
                    {session.context}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Gate approval waiting indicator */}
          {session.status === 'waiting_approval' && sessionApprovals.length === 0 && (
            <div
              className="card card-static p-5 mb-10 flex items-center gap-3"
              style={{ borderLeft: '3px solid var(--color-accent-gold)' }}
            >
              <span className="status-dot status-dot-waiting_approval" />
              <span className="text-[0.875rem] text-accent-gold">
                Waiting for gate approval
              </span>
            </div>
          )}

          {/* Pending Approvals */}
          {sessionApprovals.length > 0 && (
            <div className="mb-10">
              <SectionHeader
                icon={ShieldAlert}
                label="Pending Approvals"
                count={sessionApprovals.length}
              />
              <div className="flex flex-col gap-4 stagger-children">
                {sessionApprovals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    approval={approval}
                    onResolve={(id, status, response) => resolve(id, status, response)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Agents + Decisions two-column */}
          <div className="grid grid-cols-2 gap-10 mb-10">
            {/* Agents */}
            <div className="min-w-0">
              <SectionHeader icon={Bot} label="Agents" count={session.agents.length} />
              <div className="flex flex-col gap-3 stagger-children">
                {session.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="card card-static p-5 flex items-start gap-4"
                  >
                    <span
                      className={`status-dot status-dot-${agent.status} mt-1.5`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.875rem] text-text-primary font-medium truncate mb-2">
                        {agent.name}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`badge ${agentStatusBadge[agent.status] || 'badge-neutral'}`}
                        >
                          {agent.status}
                        </span>
                        <span className="text-[0.625rem] text-text-tertiary font-mono flex items-center gap-1">
                          <Clock size={8} strokeWidth={2} />
                          {new Date(agent.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {session.agents.length === 0 && (
                  <div className="text-text-tertiary text-[0.8125rem] py-4">
                    No agents
                  </div>
                )}
              </div>
            </div>

            {/* Decisions */}
            <div className="min-w-0">
              <SectionHeader
                icon={Lightbulb}
                label="Decisions"
                count={session.decisions.length}
              />
              <div className="flex flex-col gap-3 stagger-children">
                {session.decisions.map((decision) => (
                  <div key={decision.id} className="card card-static p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`badge ${decision.type === 'decision' ? 'badge-blue' : 'badge-ember'}`}
                      >
                        {decision.type}
                      </span>
                    </div>
                    <div className="text-[0.8125rem] text-text-primary leading-relaxed mb-3">
                      {decision.question}
                    </div>
                    <div className="markdown-body text-[0.8125rem] text-accent-gold pl-3 border-l-2 border-accent-gold/20">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={secureMarkdownComponents}
                      >
                        {decision.choice}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                {session.decisions.length === 0 && (
                  <div className="text-text-tertiary text-[0.8125rem] py-4">
                    No decisions
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Artifacts */}
          {session.artifacts && session.artifacts.length > 0 && (
            <div className="mb-10">
              <SectionHeader
                icon={FileText}
                label="Artifacts"
                count={session.artifacts.length}
              />
              <div className="flex flex-col gap-3 stagger-children">
                {session.artifacts.map((artifact) => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onTogglePin={handleTogglePin}
                    onDelete={handleDeleteArtifact}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 pb-6 border-t border-border-subtle">
            {session.status === 'active' && (
              <button
                onClick={async () => {
                  await window.athanor.invoke('session:pause' as never, sessionId);
                  const result = await window.athanor.invoke(
                    'session:get' as never,
                    sessionId,
                  );
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
                  const result = await window.athanor.invoke(
                    'session:get' as never,
                    sessionId,
                  );
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

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Session"
        description={`"${title}" will be permanently deleted.`}
        warning="All agents, messages, artifacts, decisions, and approvals in this session will be lost."
        onConfirm={handleDeleteSession}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
