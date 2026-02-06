import React, { useState } from 'react';
import { ArrowLeft, Brain, Pencil, Trash2, Save, X } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';

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
  onUpdated?: (updated: Decision) => void;
  onDeleted?: (id: string) => void;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function DecisionDetail({
  decision,
  onBack,
  onUpdated,
  onDeleted,
}: DecisionDetailProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editQuestion, setEditQuestion] = useState(decision.question);
  const [editChoice, setEditChoice] = useState(decision.choice);
  const [editRationale, setEditRationale] = useState(decision.rationale);
  const [editAlternatives, setEditAlternatives] = useState(
    parseJsonArray(decision.alternatives).join('\n'),
  );
  const [editTags, setEditTags] = useState(parseJsonArray(decision.tags).join(', '));
  const [editStatus, setEditStatus] = useState(decision.status);

  const alternatives = parseJsonArray(decision.alternatives);
  const tags = parseJsonArray(decision.tags);

  function startEditing() {
    setEditQuestion(decision.question);
    setEditChoice(decision.choice);
    setEditRationale(decision.rationale);
    setEditAlternatives(parseJsonArray(decision.alternatives).join('\n'));
    setEditTags(parseJsonArray(decision.tags).join(', '));
    setEditStatus(decision.status);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const altsArray = editAlternatives
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const tagsArray = editTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const updated = (await window.athanor.invoke('decision:update' as never, {
        id: decision.id,
        question: editQuestion,
        choice: editChoice,
        rationale: editRationale,
        alternatives: altsArray,
        tags: tagsArray,
        status: editStatus,
      })) as Decision;

      setEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      console.error('Failed to update decision:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await window.athanor.invoke('decision:delete' as never, decision.id);
      onDeleted?.(decision.id);
      onBack();
    } catch (err) {
      console.error('Failed to delete decision:', err);
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
          <div className="ml-auto flex items-center gap-1">
            {!editing && (
              <button onClick={startEditing} className="btn-ghost flex items-center gap-1.5">
                <Pencil size={13} strokeWidth={2} />
                <span className="text-[0.75rem]">Edit</span>
              </button>
            )}
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

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          <div className="text-[0.75rem] text-text-tertiary mb-4">
            {decision.origin} &middot; {new Date(decision.created_at).toLocaleString()}
          </div>

          {editing ? (
            /* Edit mode */
            <div className="space-y-5">
              {/* Question */}
              <div>
                <label className="text-[0.75rem] font-medium text-text-tertiary mb-1.5 block uppercase tracking-[0.04em]">
                  Question
                </label>
                <input
                  type="text"
                  className="input-base w-full"
                  value={editQuestion}
                  onChange={(e) => setEditQuestion(e.target.value)}
                />
              </div>

              {/* Choice */}
              <div>
                <label className="text-[0.75rem] font-medium text-accent-gold mb-1.5 block uppercase tracking-[0.04em]">
                  Choice
                </label>
                <input
                  type="text"
                  className="input-base w-full"
                  value={editChoice}
                  onChange={(e) => setEditChoice(e.target.value)}
                />
              </div>

              {/* Rationale */}
              <div>
                <label className="text-[0.75rem] font-medium text-text-tertiary mb-1.5 block uppercase tracking-[0.04em]">
                  Rationale
                </label>
                <textarea
                  className="input-base w-full"
                  rows={4}
                  value={editRationale}
                  onChange={(e) => setEditRationale(e.target.value)}
                />
              </div>

              {/* Alternatives */}
              <div>
                <label className="text-[0.75rem] font-medium text-text-tertiary mb-1.5 block uppercase tracking-[0.04em]">
                  Alternatives (one per line)
                </label>
                <textarea
                  className="input-base w-full"
                  rows={4}
                  value={editAlternatives}
                  onChange={(e) => setEditAlternatives(e.target.value)}
                  placeholder="One alternative per line"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-[0.75rem] font-medium text-text-tertiary mb-1.5 block uppercase tracking-[0.04em]">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  className="input-base w-full"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="tag1, tag2, src/file.ts"
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-[0.75rem] font-medium text-text-tertiary mb-1.5 block uppercase tracking-[0.04em]">
                  Status
                </label>
                <select
                  className="input-base"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="invalidated">Invalidated</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Save size={13} strokeWidth={2} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <X size={13} strokeWidth={2} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Read-only mode */
            <>
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
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Decision"
        description="This decision will be permanently deleted."
        warning="This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
