import React, { useState, useEffect } from 'react';
import { PhaseEditor, type PhaseData } from './PhaseEditor';
import { ArrowLeft, Plus, Save, Workflow } from 'lucide-react';

function parsePermissionMode(config: string | null): PhaseData['permission_mode'] {
  if (!config) return 'default';
  try {
    const parsed = JSON.parse(config) as { permission_mode?: unknown };
    return parsed.permission_mode === 'bypassPermissions' ? 'bypassPermissions' : 'default';
  } catch {
    return 'default';
  }
}

interface WorkflowEditorProps {
  workflowId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function WorkflowEditor({
  workflowId,
  onSaved,
  onCancel,
}: WorkflowEditorProps): React.ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phases, setPhases] = useState<PhaseData[]>([]);
  const [saving, setSaving] = useState(false);

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
        result.phases.map((p) => ({
          id: p.id,
          name: p.name,
          prompt_template: p.prompt_template,
          allowed_tools: p.allowed_tools ? JSON.parse(p.allowed_tools) : null,
          agents: p.agents ? JSON.parse(p.agents) : {},
          approval: p.approval,
          permission_mode: parsePermissionMode(p.config),
        })),
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
      },
    ]);
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
        </div>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          <div className="mb-6">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow name"
              className="input-base w-full mb-2"
              style={{ fontSize: '0.9375rem' }}
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              }}
              onRemove={() => setPhases(phases.filter((_, j) => j !== i))}
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

          <div className="flex gap-2 pb-4">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="btn-primary flex items-center gap-1.5"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
