import React, { useState, useEffect } from 'react';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { Plus, Rocket, X } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  repo_id: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
}

interface LaunchSessionProps {
  onLaunched: () => void;
}

export function LaunchSession({ onLaunched }: LaunchSessionProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [context, setContext] = useState('');
  const [launching, setLaunching] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ws, wf] = await Promise.all([
          window.athanor.invoke('db:list-workspaces' as never),
          window.athanor.invoke('workflow:list' as never),
        ]);
        setWorkspaces(ws as Workspace[]);
        setWorkflows(wf as Workflow[]);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    if (expanded) loadData();
  }, [expanded]);

  const handleLaunch = async () => {
    if (!selectedWorkspace || !selectedWorkflow) return;
    setLaunching(true);
    try {
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string };
      await window.athanor.invoke('session:start' as never, {
        userId: user.id,
        workspaceId: selectedWorkspace,
        workflowId: selectedWorkflow,
        context: context || undefined,
      });
      setContext('');
      setExpanded(false);
      onLaunched();
    } catch (err) {
      console.error('Failed to launch session:', err);
    } finally {
      setLaunching(false);
    }
  };

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="launch-trigger">
        <Plus size={15} />
        Launch New Session
      </button>
    );
  }

  const noItems = workspaces.length === 0 || workflows.length === 0;

  return (
    <div className="card card-static p-5 mb-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[0.875rem] font-semibold text-text-primary flex items-center gap-2.5">
          <Rocket size={15} className="text-accent-ember" />
          Launch Session
        </div>
        <button onClick={() => setExpanded(false)} className="btn-icon !w-7 !h-7">
          <X size={14} />
        </button>
      </div>

      {noItems && (
        <div className="text-[0.75rem] text-text-tertiary mb-3">
          {workspaces.length === 0 && <span>Create a workspace in the Workspaces tab first. </span>}
          {workflows.length === 0 && <span>Create a workflow in the Workflows tab first.</span>}
        </div>
      )}

      <div className="mb-3">
        <select
          value={selectedWorkspace}
          onChange={(e) => setSelectedWorkspace(e.target.value)}
          className="input-base w-full"
        >
          <option value="">Select Workspace</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <select
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          className="input-base w-full"
        >
          <option value="">Select Workflow</option>
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {wf.name}
            </option>
          ))}
        </select>
      </div>

      <div className="text-[0.6875rem] text-text-tertiary mb-1.5">Context</div>
      <TransparentMarkdownEditor
        value={context}
        onChange={setContext}
        placeholder="Add context for this session..."
        rows={6}
        normalTextareaClassName="input-base w-full min-h-[100px] resize-y mb-3 font-mono text-[0.8125rem] leading-relaxed"
        transparentContainerClassName="relative min-h-[120px] max-h-[220px] border border-border-default rounded-md mb-3 overflow-hidden bg-surface-2"
        transparentPreviewStyle={{
          padding: 10,
          height: '100%',
          overflow: 'auto',
          fontSize: '0.8125rem',
          lineHeight: 1.5,
        }}
        transparentTextareaStyle={{
          resize: 'none',
          padding: 10,
          borderRadius: 6,
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono)',
        }}
      />

      <div className="flex gap-2">
        <button
          onClick={handleLaunch}
          disabled={launching || !selectedWorkspace || !selectedWorkflow}
          className="btn-primary flex items-center gap-1.5"
        >
          <Rocket size={13} />
          {launching ? 'Launching...' : 'Launch'}
        </button>
        <button onClick={() => setExpanded(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
