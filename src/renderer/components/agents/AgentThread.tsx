import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, X, OctagonX, PenLine } from 'lucide-react';
import { useAgentStream } from '../../hooks/useAgentStream';
import { MessageBubble } from './MessageBubble';
import { StreamingText } from './StreamingText';
import { DecisionPayloadView } from '../approvals/DecisionPayloadView';

const PHASE_TERMINATE_TEXT = [
  'DIRECTIVE: Terminate this phase now.',
  '',
  'You must immediately:',
  '1. Write your phase artifact via athanor_artifact (if not already written)',
  '2. Call athanor_phase_complete with status "complete" and a summary of what you accomplished',
  '',
  'Do not start any new work. Wrap up and complete the phase.',
].join('\n');

interface Message {
  id: string;
  type: string;
  content_preview: string | null;
  content_path: string | null;
  metadata: string | null;
  created_at: string;
}

interface PendingApproval {
  id: string;
  agent_id: string | null;
  type: string;
  summary: string;
  payload: string | null;
  status: string;
}

interface AgentThreadProps {
  agentId: string;
}

function getApprovalDetail(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed.command === 'string' && parsed.command.trim()) {
      return `Command: ${parsed.command}`;
    }
    if (typeof parsed.tool_name === 'string' && parsed.tool_name.trim()) {
      return `Tool: ${parsed.tool_name}`;
    }
  } catch {
    // ignore malformed payloads
  }
  return null;
}

function parseDecisionPayload(
  payload: string | null,
): { question?: string; choice?: string; rationale?: string; alternatives?: string[]; tags?: string[]; decisionId?: string } | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.question || parsed.choice) {
      return parsed as { question?: string; choice?: string; rationale?: string; alternatives?: string[]; tags?: string[]; decisionId?: string };
    }
  } catch {
    // ignore
  }
  return null;
}

export function AgentThread({ agentId }: AgentThreadProps): React.ReactElement {
  const [historicalMessages, setHistoricalMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [approvalResponses, setApprovalResponses] = useState<Record<string, string>>({});
  const [showCustomEditor, setShowCustomEditor] = useState<Record<string, boolean>>({});
  const { streamingText, isStreaming } = useAgentStream(agentId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function loadMessages() {
      try {
        const msgs = await window.athanor.invoke('agent:get-messages' as never, agentId);
        setHistoricalMessages(msgs as Message[]);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }

    loadMessages();
    const cleanup = window.athanor.on('agent:message' as never, (data: unknown) => {
      const { agentId: msgAgentId } = data as { agentId: string };
      if (msgAgentId === agentId) {
        loadMessages();
      }
    });

    return cleanup;
  }, [agentId]);

  useEffect(() => {
    async function loadApprovals() {
      try {
        const approvals = (await window.athanor.invoke(
          'approval:list-pending' as never,
        )) as PendingApproval[];
        setPendingApprovals(approvals.filter((approval) => approval.agent_id === agentId));
      } catch (err) {
        console.error('Failed to load pending approvals:', err);
      }
    }

    loadApprovals();
    const cleanupNew = window.athanor.on('approval:new' as never, (data: unknown) => {
      const approval = data as PendingApproval;
      if (approval.agent_id === agentId) {
        loadApprovals();
      }
    });
    const cleanupResolved = window.athanor.on('approval:resolved' as never, (data: unknown) => {
      const approval = data as PendingApproval;
      if (approval.agent_id === agentId) {
        loadApprovals();
      }
    });

    return () => {
      cleanupNew();
      cleanupResolved();
    };
  }, [agentId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [historicalMessages, streamingText, pendingApprovals]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 280)}px`;
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    setIsSending(true);
    try {
      await window.athanor.invoke('agent:send-input' as never, agentId, input);
      setInput('');
    } catch (err) {
      console.error('Failed to send input:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleResolveApproval = async (approvalId: string, status: 'approved' | 'rejected', responseOverride?: string) => {
    setResolvingApprovalId(approvalId);
    try {
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string } | null;
      if (!user) return;

      const response = responseOverride ?? (approvalResponses[approvalId] || undefined);

      await window.athanor.invoke('approval:resolve' as never, {
        id: approvalId,
        status,
        userId: user.id,
        response,
      });

      // Clean up response state for this approval
      setApprovalResponses((prev) => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
      // Clean up custom editor state
      setShowCustomEditor((prev) => {
        const next = { ...prev };
        delete next[approvalId];
        return next;
      });
    } catch (err) {
      console.error('Failed to resolve approval:', err);
    } finally {
      setResolvingApprovalId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
        <div className="py-6 pb-24 px-[10%]">
          {historicalMessages.length === 0 && !isStreaming && pendingApprovals.length === 0 && (
            <div className="flex items-center justify-center py-24">
              <div className="text-text-tertiary text-[0.8125rem]">Waiting for agent output...</div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            {historicalMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isStreaming && streamingText && <StreamingText text={streamingText} />}

            {pendingApprovals.map((approval) => {
              const decisionPayload = approval.type === 'decision' ? parseDecisionPayload(approval.payload) : null;
              const detail = !decisionPayload ? getApprovalDetail(approval.payload) : null;
              const isContinuation = approval.type === 'needs_input' || approval.type === 'agent_idle';
              const customEditorOpen = showCustomEditor[approval.id] ?? false;
              const customText = approvalResponses[approval.id] || '';
              return (
                <div key={approval.id} className="animate-fade-in my-2">
                  <div className="rounded-xl bg-surface-2 border border-accent-ember/20 p-4">
                    <div className="text-[0.6875rem] text-accent-ember font-medium tracking-wide uppercase mb-2">
                      {isContinuation ? 'Action Required' : 'Approval Required'}
                    </div>
                    <div className="text-[0.8125rem] text-text-primary leading-relaxed mb-2">
                      {approval.summary}
                    </div>

                    {/* Decision payload structured view */}
                    {decisionPayload && (
                      <div className="mt-2 mb-3">
                        <DecisionPayloadView payload={decisionPayload} compact />
                      </div>
                    )}

                    {/* Generic detail */}
                    {detail && (
                      <div className="text-[0.75rem] text-text-tertiary mt-1.5 font-mono">
                        {detail}
                      </div>
                    )}

                    {isContinuation ? (
                      <>
                        {customEditorOpen && (
                          <textarea
                            value={customText}
                            onChange={(e) =>
                              setApprovalResponses((prev) => ({
                                ...prev,
                                [approval.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && customText.trim()) {
                                e.preventDefault();
                                void handleResolveApproval(approval.id, 'approved', customText);
                              }
                            }}
                            placeholder="Your response..."
                            rows={2}
                            className="input-base w-full mt-2 mb-2 min-h-[48px] resize-y font-mono text-[0.75rem] leading-relaxed"
                            autoFocus
                          />
                        )}
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => void handleResolveApproval(approval.id, 'approved', PHASE_TERMINATE_TEXT)}
                            disabled={resolvingApprovalId === approval.id}
                            className="btn-danger flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem]"
                          >
                            <OctagonX size={12} />
                            Phase Terminate
                          </button>
                          <button
                            onClick={() => void handleResolveApproval(approval.id, 'approved', 'Continue.')}
                            disabled={resolvingApprovalId === approval.id}
                            className="btn-primary flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem]"
                          >
                            <Check size={12} />
                            Affirm
                          </button>
                          {customEditorOpen ? (
                            <>
                              <button
                                onClick={() => {
                                  setShowCustomEditor((prev) => ({ ...prev, [approval.id]: false }));
                                  setApprovalResponses((prev) => {
                                    const next = { ...prev };
                                    delete next[approval.id];
                                    return next;
                                  });
                                }}
                                disabled={resolvingApprovalId === approval.id}
                                className="btn-ghost flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem]"
                              >
                                <X size={12} />
                                Cancel
                              </button>
                              {customText.trim() && (
                                <button
                                  onClick={() => void handleResolveApproval(approval.id, 'approved', customText)}
                                  disabled={resolvingApprovalId === approval.id}
                                  className="btn-primary flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem]"
                                >
                                  <ArrowUp size={12} />
                                  Send
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => setShowCustomEditor((prev) => ({ ...prev, [approval.id]: true }))}
                              disabled={resolvingApprovalId === approval.id}
                              className="btn-secondary flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem]"
                            >
                              <PenLine size={12} />
                              Custom
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Response textarea for standard approvals */}
                        <textarea
                          value={approvalResponses[approval.id] || ''}
                          onChange={(e) =>
                            setApprovalResponses((prev) => ({
                              ...prev,
                              [approval.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional response..."
                          rows={2}
                          className="input-base w-full mt-2 mb-2 min-h-[48px] resize-y font-mono text-[0.75rem] leading-relaxed"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => void handleResolveApproval(approval.id, 'approved')}
                            disabled={resolvingApprovalId === approval.id}
                            className="btn-primary flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem]"
                          >
                            <Check size={12} />
                            Approve
                          </button>
                          <button
                            onClick={() => void handleResolveApproval(approval.id, 'rejected')}
                            disabled={resolvingApprovalId === approval.id}
                            className="btn-ghost flex items-center gap-1.5 !py-1.5 !px-3 !text-[0.75rem] !text-status-failed !border-status-failed/30 !border"
                          >
                            <X size={12} />
                            Reject
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-[10%]" style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div className="rounded-2xl bg-surface-1 border border-border-default shadow-[0_2px_24px_rgba(0,0,0,0.12)] focus-within:border-accent-ember/30 focus-within:shadow-[0_2px_32px_rgba(212,105,46,0.06)] transition-all duration-200 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, give instructions, or continue the conversation..."
            rows={3}
            className="w-full bg-transparent outline-none resize-none text-text-primary font-sans max-h-[240px]"
            style={{
              padding: '24px 28px 12px',
              minHeight: 120,
              border: 'none',
              fontSize: '1.125rem',
              lineHeight: 1.6,
            }}
            autoFocus
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
          />
          <div className="flex items-center justify-end gap-3" style={{ padding: '0 20px 16px' }}>
            <span className="text-text-tertiary/50 select-none text-[1.875rem] leading-none">
              <kbd className="font-mono">⌘↵</kbd>
            </span>
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 disabled:opacity-15 disabled:cursor-not-allowed"
              style={{
                background: input.trim()
                  ? 'linear-gradient(135deg, var(--color-accent-ember), var(--color-accent-gold))'
                  : 'var(--color-surface-3)',
                color: input.trim() ? '#fff' : 'var(--color-text-tertiary)',
              }}
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
