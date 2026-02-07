import React, { useState } from 'react';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { GitStrategyPicker } from '../shared/GitStrategyPicker';
import { ChevronRight, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { CliAgentType, PhasePermissionMode } from '../../../shared/types/domain';
import type { GitStrategy } from '../../../shared/types/workflow-phase';

export interface PhaseData {
  id?: string;
  name: string;
  prompt_template: string;
  allowed_tools: string[] | null;
  agents: Record<string, unknown>;
  approval: string;
  permission_mode: PhasePermissionMode;
  agent_type: CliAgentType;
  git_strategy: GitStrategy | null;
}

interface PhaseEditorProps {
  phase: PhaseData;
  index: number;
  onChange: (phase: PhaseData) => void;
  onRemove: () => void;
}

const GATE_LABELS: Record<string, string> = {
  none: 'No gate',
  before: 'Before',
  after: 'After',
};

export function PhaseEditor({
  phase,
  index,
  onChange,
  onRemove,
}: PhaseEditorProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  return (
    <div className={`phase-accordion${expanded ? ' phase-accordion-expanded' : ''}`}>
      <button
        type="button"
        className="phase-accordion-trigger"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <ChevronRight
          size={13}
          strokeWidth={2.5}
          className={`phase-accordion-chevron${expanded ? ' phase-accordion-chevron-open' : ''}`}
        />
        <span className="phase-accordion-num">{index + 1}</span>
        <span
          className="phase-accordion-title"
          style={
            !phase.name ? { color: 'var(--color-text-tertiary)', fontStyle: 'italic' } : undefined
          }
        >
          {phase.name || 'Untitled phase'}
        </span>
        {phase.approval !== 'none' && (
          <span className="badge badge-ember" style={{ flexShrink: 0 }}>
            {GATE_LABELS[phase.approval]}
          </span>
        )}
        {phase.permission_mode === 'bypassPermissions' && (
          <span className="badge badge-red" style={{ flexShrink: 0 }}>
            Unsafe
          </span>
        )}
        <span
          className={`badge ${phase.agent_type === 'codex' ? 'badge-blue' : 'badge-neutral'}`}
          style={{ flexShrink: 0 }}
        >
          {phase.agent_type === 'codex' ? 'Codex' : 'Claude'}
        </span>
        {phase.git_strategy && phase.git_strategy.mode !== 'worktree' && (
          <span className="badge badge-violet" style={{ flexShrink: 0 }}>
            {phase.git_strategy.mode === 'main'
              ? 'Main'
              : `Branch: ${phase.git_strategy.branch}`}
          </span>
        )}
        <span
          className="phase-accordion-remove"
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            setShowRemoveConfirm(true);
          }}
          title="Remove phase"
        >
          <Trash2 size={12} />
        </span>
      </button>

      <div className="phase-accordion-body">
        <div className="phase-accordion-overflow">
          <div className="phase-accordion-content">
            <div className="phase-field">
              <label className="phase-label">Phase Name</label>
              <input
                type="text"
                value={phase.name}
                onChange={(e) => onChange({ ...phase, name: e.target.value })}
                placeholder="e.g. Investigate, Plan, Execute..."
                className="phase-input"
              />
            </div>

            <div className="phase-field-row">
              <div className="phase-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="phase-label">Approval Gate</label>
                <div className="phase-select-wrap">
                  <select
                    value={phase.approval}
                    onChange={(e) => onChange({ ...phase, approval: e.target.value })}
                    className="phase-select"
                  >
                    <option value="none">No gate</option>
                    <option value="before">Before phase</option>
                    <option value="after">After phase</option>
                  </select>
                </div>
              </div>
              <div className="phase-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="phase-label">CLI Agent</label>
                <div className="phase-select-wrap">
                  <select
                    value={phase.agent_type}
                    onChange={(e) =>
                      onChange({
                        ...phase,
                        agent_type: e.target.value as PhaseData['agent_type'],
                      })
                    }
                    className="phase-select"
                  >
                    <option value="claude">Claude</option>
                    <option value="codex">Codex</option>
                  </select>
                </div>
              </div>
              <div className="phase-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="phase-label">Permissions</label>
                <div className="phase-select-wrap">
                  <select
                    value={phase.permission_mode}
                    onChange={(e) =>
                      onChange({
                        ...phase,
                        permission_mode: e.target.value as PhaseData['permission_mode'],
                      })
                    }
                    className="phase-select"
                  >
                    <option value="default">Safer default</option>
                    <option value="bypassPermissions">Bypass permissions</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="phase-field">
              <label className="phase-label">Git Strategy</label>
              <GitStrategyPicker
                value={phase.git_strategy}
                onChange={(v) => onChange({ ...phase, git_strategy: v })}
                allowInherit
              />
            </div>

            <div className="phase-field">
              <label className="phase-label">Prompt Template</label>
              <TransparentMarkdownEditor
                value={phase.prompt_template}
                onChange={(value) => onChange({ ...phase, prompt_template: value })}
                placeholder="Write phase instructions in markdown..."
                rows={6}
                normalTextareaClassName="phase-textarea"
                transparentContainerClassName="phase-textarea"
                transparentPreviewStyle={{
                  padding: '10px 12px',
                  fontSize: '0.8125rem',
                  lineHeight: '1.6',
                }}
                transparentTextareaStyle={{
                  padding: '10px 12px',
                  fontSize: '0.8125rem',
                  lineHeight: '1.6',
                  fontFamily: 'var(--font-mono)',
                  resize: 'vertical',
                }}
              />
            </div>

            <div className="phase-field" style={{ marginBottom: 0 }}>
              <label className="phase-label">Allowed Tools</label>
              <input
                type="text"
                value={phase.allowed_tools ? phase.allowed_tools.join(', ') : ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  onChange({
                    ...phase,
                    allowed_tools: val ? val.split(',').map((t) => t.trim()) : null,
                  });
                }}
                placeholder="Leave empty for default profile"
                className="phase-input"
              />
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove Phase"
        description={`"${phase.name || 'Untitled phase'}" will be removed from this workflow.`}
        confirmLabel="Remove"
        onConfirm={() => {
          setShowRemoveConfirm(false);
          onRemove();
        }}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}
