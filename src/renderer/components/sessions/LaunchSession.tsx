import React, { useState, useEffect } from 'react';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { GitStrategyPicker } from '../shared/GitStrategyPicker';
import { ErrorDialog } from '../shared/ErrorDialog';
import { Plus, Rocket, X, GitBranch, Settings2 } from 'lucide-react';
import type { GitStrategy } from '../../../shared/types/workflow-phase';

interface Repo {
  id: string;
  name: string;
  local_path: string;
}

interface Workspace {
  id: string;
  name: string;
  repo_id: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  git_strategy: string | null;
}

function describeStrategy(strategy: GitStrategy | null): string {
  if (!strategy) return 'Worktree (isolated)';
  switch (strategy.mode) {
    case 'worktree':
      return 'Worktree (isolated)';
    case 'main':
      return 'Main (in-place)';
    case 'branch':
      return `Branch: ${strategy.branch} (${strategy.isolation === 'worktree' ? 'worktree' : 'in-place'})`;
  }
}

function parseStrategy(raw: string | null): GitStrategy | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GitStrategy;
  } catch {
    return null;
  }
}

interface LaunchSessionProps {
  onLaunched: () => void;
}

export function LaunchSession({ onLaunched }: LaunchSessionProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [gitStrategyOverride, setGitStrategyOverride] = useState<GitStrategy | null>(null);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [workspaceRepos, setWorkspaceRepos] = useState<Repo[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  // Load repos when workspace changes
  useEffect(() => {
    if (!selectedWorkspace) {
      setWorkspaceRepos([]);
      return;
    }
    const loadRepos = async () => {
      try {
        const repos = (await window.athanor.invoke(
          'db:workspace-repos' as never,
          selectedWorkspace,
        )) as Repo[];
        setWorkspaceRepos(repos);
      } catch {
        setWorkspaceRepos([]);
      }
    };
    void loadRepos();
  }, [selectedWorkspace]);

  // Derive the workflow's default git strategy
  const selectedWorkflowObj = workflows.find((wf) => wf.id === selectedWorkflow);
  const workflowDefault = selectedWorkflowObj
    ? parseStrategy(selectedWorkflowObj.git_strategy)
    : null;

  const handleLaunch = async () => {
    if (!selectedWorkspace || !selectedWorkflow) return;
    setLaunching(true);
    setError(null);
    try {
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string };
      await window.athanor.invoke('session:start' as never, {
        userId: user.id,
        workspaceId: selectedWorkspace,
        workflowId: selectedWorkflow,
        description: description || undefined,
        context: context || undefined,
        gitStrategy: overrideEnabled && gitStrategyOverride ? gitStrategyOverride : undefined,
      });
      setDescription('');
      setContext('');
      setGitStrategyOverride(null);
      setOverrideEnabled(false);
      setExpanded(false);
      onLaunched();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
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

      <div className="mb-3">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Session title (optional)"
          className="input-base w-full"
          maxLength={200}
        />
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

      {/* Workspace repos info */}
      {selectedWorkspace && workspaceRepos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {workspaceRepos.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-3 text-[0.6875rem] text-text-secondary"
            >
              <GitBranch size={9} strokeWidth={2} className="text-text-tertiary" />
              {r.name}
            </span>
          ))}
        </div>
      )}

      <div className="mb-3">
        <select
          value={selectedWorkflow}
          onChange={(e) => {
            setSelectedWorkflow(e.target.value);
            setOverrideEnabled(false);
            setGitStrategyOverride(null);
          }}
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

      {selectedWorkflow && (
        <div className="mb-3">
          <div className="text-[0.6875rem] text-text-tertiary mb-1.5">Git Strategy</div>
          {!overrideEnabled ? (
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] text-text-secondary">
                {describeStrategy(workflowDefault)}
              </span>
              <span className="text-[0.6875rem] text-text-tertiary">(workflow default)</span>
              <button
                type="button"
                onClick={() => setOverrideEnabled(true)}
                className="btn-ghost flex items-center gap-1 text-[0.6875rem] !px-1.5 !py-0.5"
              >
                <Settings2 size={11} />
                Override
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[0.6875rem] font-medium text-accent-ember">Override active</span>
                <button
                  type="button"
                  onClick={() => {
                    setOverrideEnabled(false);
                    setGitStrategyOverride(null);
                  }}
                  className="btn-ghost text-[0.6875rem] !px-1.5 !py-0.5"
                >
                  Reset
                </button>
              </div>
              <GitStrategyPicker
                value={gitStrategyOverride}
                onChange={setGitStrategyOverride}
                workspaceId={selectedWorkspace || undefined}
              />
            </div>
          )}
        </div>
      )}

      <ErrorDialog
        open={!!error}
        title="Launch Failed"
        message={error || ''}
        onDismiss={() => setError(null)}
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
