import React, { useEffect, useState } from 'react';
import { WorkflowEditor } from './WorkflowEditor';
import { Plus, Workflow, Clock, ChevronRight } from 'lucide-react';

interface WorkflowData {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowListProps {
  selectedWorkflowId?: string;
  onSelectWorkflow: (id: string) => void;
}

export function WorkflowList({
  selectedWorkflowId,
  onSelectWorkflow,
}: WorkflowListProps): React.ReactElement {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const result = await window.athanor.invoke('workflow:list' as never);
      setWorkflows(result as WorkflowData[]);
    } catch (err) {
      console.error('Failed to load workflows:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  if (editing !== null) {
    return (
      <WorkflowEditor
        workflowId={editing === 'new' ? undefined : editing}
        onSaved={() => {
          setEditing(null);
          fetchWorkflows();
        }}
        onCancel={() => setEditing(null)}
        onDeleted={() => {
          setEditing(null);
          fetchWorkflows();
        }}
      />
    );
  }

  if (selectedWorkflowId) {
    return (
      <WorkflowEditor
        workflowId={selectedWorkflowId}
        onSaved={() => {
          onSelectWorkflow('');
          fetchWorkflows();
        }}
        onCancel={() => onSelectWorkflow('')}
        onDeleted={() => {
          onSelectWorkflow('');
          fetchWorkflows();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>Workflows</h2>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-1.5">
          <Plus size={14} />
          New
        </button>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          {loading && <div className="text-text-tertiary text-[0.8125rem]">Loading...</div>}

          <div className="flex flex-col gap-4 stagger-children">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="card card-accent-left card-flush group cursor-pointer"
                onClick={() => setEditing(wf.id)}
              >
                <div className="relative z-[1] p-6 pl-7 flex items-center gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent-glow flex items-center justify-center">
                    <Workflow size={16} strokeWidth={1.75} className="text-accent-ember" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="card-title">{wf.name}</div>
                    {wf.description && <div className="card-subtitle">{wf.description}</div>}
                    <div className="card-meta mt-1.5">
                      <span className="flex items-center gap-1.5">
                        <Clock size={10} strokeWidth={2} />
                        Updated {new Date(wf.updated_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Trailing affordance */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity duration-150"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && workflows.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Workflow size={22} strokeWidth={1.5} />
              </div>
              <div className="empty-state-title">No workflows yet</div>
              <div className="empty-state-desc">
                Create a workflow to define multi-phase agent pipelines.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
