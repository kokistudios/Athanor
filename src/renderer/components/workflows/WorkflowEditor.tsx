import React, { useState, useEffect } from 'react';
import { PhaseEditor, type PhaseData } from './PhaseEditor';
import { ArrowLeft, Plus, Save, Workflow, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { GitStrategy, WorkflowPhaseConfig } from '../../../shared/types/workflow-phase';
import { CLI_AGENT_TYPES, GIT_STRATEGY_MODES, LOOP_CONDITIONS, RELAY_MODES } from '../../../shared/types/domain';
import type { LoopCondition, RelayMode } from '../../../shared/types/domain';

const CLI_AGENT_TYPE_SET = new Set<string>(CLI_AGENT_TYPES);
const GIT_STRATEGY_MODE_SET = new Set<string>(GIT_STRATEGY_MODES);
const RELAY_MODE_SET = new Set<string>(RELAY_MODES);
const LOOP_CONDITION_SET = new Set<string>(LOOP_CONDITIONS);

function parsePhaseConfig(config: string | null): Required<Pick<PhaseData, 'permission_mode' | 'agent_type' | 'git_strategy' | 'relay' | 'loop_to' | 'max_iterations' | 'loop_condition'>> {
  const defaults = {
    permission_mode: 'default' as const,
    agent_type: 'claude' as const,
    git_strategy: null as GitStrategy | null,
    relay: 'summary' as RelayMode,
    loop_to: null as number | null,
    max_iterations: null as number | null,
    loop_condition: null as LoopCondition | null,
  };
  if (!config) return defaults;
  try {
    const parsed = JSON.parse(config) as WorkflowPhaseConfig;
    const permission_mode =
      parsed.permission_mode === 'bypassPermissions' ? 'bypassPermissions' : 'default';
    const agent_type =
      typeof parsed.agent_type === 'string' && CLI_AGENT_TYPE_SET.has(parsed.agent_type)
        ? parsed.agent_type
        : 'claude';
    let git_strategy: GitStrategy | null = null;
    if (parsed.git_strategy && GIT_STRATEGY_MODE_SET.has(parsed.git_strategy.mode)) {
      git_strategy = parsed.git_strategy;
    }
    const relay: RelayMode =
      typeof parsed.relay === 'string' && RELAY_MODE_SET.has(parsed.relay)
        ? (parsed.relay as RelayMode)
        : 'summary';
    const loop_to = typeof parsed.loop_to === 'number' ? parsed.loop_to : null;
    const max_iterations = typeof parsed.max_iterations === 'number' ? parsed.max_iterations : null;
    const loop_condition: LoopCondition | null =
      typeof parsed.loop_condition === 'string' && LOOP_CONDITION_SET.has(parsed.loop_condition)
        ? (parsed.loop_condition as LoopCondition)
        : null;
    return { permission_mode, agent_type, git_strategy, relay, loop_to, max_iterations, loop_condition };
  } catch {
    return defaults;
  }
}

interface WorkflowEditorProps {
  workflowId?: string;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export function WorkflowEditor({
  workflowId,
  onSaved,
  onCancel,
  onDeleted,
}: WorkflowEditorProps): React.ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dirty, setDirty] = useState(!workflowId);

  useEffect(() => {
    if (!workflowId) return;

    const loadWorkflow = async () => {
      const result = (await window.athanor.invoke('workflow:get' as never, workflowId)) as {
        name: string;
        description: string | null;
        phases: Array<{
          id: string;
          name: string;
          prompt_template: string;
          allowed_tools: string | null;
          agents: string | null;
          approval: string;
          config: string | null;
        }>;
      } | null;

      if (!result) return;

      setName(result.name);
      setDescription(result.description || '');
      setPhases(
        result.phases.map((p) => {
          const phaseConfig = parsePhaseConfig(p.config);
          return {
            id: p.id,
            name: p.name,
            prompt_template: p.prompt_template,
            allowed_tools: p.allowed_tools ? JSON.parse(p.allowed_tools) : null,
            agents: p.agents ? JSON.parse(p.agents) : {},
            approval: p.approval,
            permission_mode: phaseConfig.permission_mode,
            agent_type: phaseConfig.agent_type,
            git_strategy: phaseConfig.git_strategy,
            relay: phaseConfig.relay,
            loop_to: phaseConfig.loop_to,
            max_iterations: phaseConfig.max_iterations,
            loop_condition: phaseConfig.loop_condition,
          };
        }),
      );
    };

    void loadWorkflow();
  }, [workflowId]);

  const addPhase = () => {
    setPhases([
      ...phases,
      {
        name: '',
        prompt_template: '',
        allowed_tools: null,
        agents: {},
        approval: 'none',
        permission_mode: 'default',
        agent_type: 'claude',
        git_strategy: null,
        relay: 'summary',
        loop_to: null,
        max_iterations: null,
        loop_condition: null,
      },
    ]);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const phasePayloads = phases.map((p) => ({
        ...(p.id ? { id: p.id } : {}),
        name: p.name,
        prompt_template: p.prompt_template,
        allowed_tools: p.allowed_tools,
        agents: Object.keys(p.agents).length > 0 ? p.agents : undefined,
        approval: p.approval,
        config: {
          permission_mode: p.permission_mode,
          agent_type: p.agent_type,
          ...(p.git_strategy ? { git_strategy: p.git_strategy } : {}),
          ...(p.relay !== 'summary' ? { relay: p.relay } : {}),
          ...(p.loop_to !== null ? { loop_to: p.loop_to } : {}),
          ...(p.max_iterations !== null ? { max_iterations: p.max_iterations } : {}),
          ...(p.loop_condition !== null ? { loop_condition: p.loop_condition } : {}),
        },
      }));

      if (workflowId) {
        await window.athanor.invoke('workflow:update' as never, {
          id: workflowId,
          name,
          description: description || undefined,
          phases: phasePayloads,
        });
      } else {
        const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string };
        await window.athanor.invoke('workflow:create' as never, {
          userId: user.id,
          name,
          description: description || undefined,
          phases: phasePayloads,
        });
      }
      onSaved();
    } catch (err) {
      console.error('Failed to save workflow:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!workflowId) return;
    try {
      await window.athanor.invoke('workflow:delete' as never, workflowId);
      onDeleted?.();
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <button
          onClick={onCancel}
          className="btn-ghost flex items-center gap-1.5 !px-0 !py-0 text-[0.75rem] mb-2"
        >
          <ArrowLeft size={13} />
          Back to workflows
        </button>
        <div className="flex items-center gap-3">
          <Workflow size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>{workflowId ? 'Edit Workflow' : 'New Workflow'}</h2>
          {workflowId && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-ghost flex items-center gap-1.5 text-status-failed"
            >
              <Trash2 size={13} strokeWidth={2} />
              <span className="text-[0.75rem]">Delete</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !dirty}
            className="ml-auto btn-ghost flex items-center gap-1.5 text-accent-ember"
          >
            <Save size={13} strokeWidth={2} />
            <span className="text-[0.75rem]">{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          <div className="mb-6">
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              placeholder="Workflow name"
              className="input-base w-full mb-2"
              style={{ fontSize: '0.9375rem' }}
            />
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
              placeholder="Description"
              className="input-base w-full"
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[0.6875rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary">
              Phases
            </h3>
          </div>

          {/* Phase progress visualization */}
          {phases.length > 0 && (
            <div className="flex items-center gap-0 mb-5 px-1">
              {phases.map((_, i) => (
                <React.Fragment key={i}>
                  <div
                    className={`phase-node ${i === 0 ? 'phase-node-current' : ''}`}
                    title={`Phase ${i + 1}`}
                  />
                  {i < phases.length - 1 && <div className="phase-connector" />}
                </React.Fragment>
              ))}
            </div>
          )}

          {phases.map((phase, i) => (
            <PhaseEditor
              key={i}
              phase={phase}
              index={i}
              onChange={(updated) => {
                const newPhases = [...phases];
                newPhases[i] = updated;
                setPhases(newPhases);
                setDirty(true);
              }}
              onRemove={() => { setPhases(phases.filter((_, j) => j !== i)); setDirty(true); }}
            />
          ))}

          <button
            onClick={addPhase}
            className="btn-secondary w-full flex items-center justify-center gap-2 mb-6"
            style={{ padding: '10px 16px' }}
          >
            <Plus size={14} />
            Add Phase
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Workflow"
        description={`"${name || 'Untitled workflow'}" will be permanently deleted.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
