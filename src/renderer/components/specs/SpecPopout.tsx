import React, { useState, useEffect, useCallback } from 'react';
import { parse as parseYaml } from 'yaml';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { GitStrategyPicker } from '../shared/GitStrategyPicker';
import { Rocket, X } from 'lucide-react';
import type { GitStrategy } from '../../../shared/types/workflow-phase';

interface Workspace {
  id: string;
  name: string;
}

interface Workflow {
  id: string;
  name: string;
}

interface SpecFrontmatter {
  workspace?: string;
  workflow?: string;
  description?: string;
  git_strategy?: GitStrategy;
}

function parseFrontmatter(content: string): { frontmatter: SpecFrontmatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  try {
    const parsed = parseYaml(match[1]) as SpecFrontmatter | null;
    return { frontmatter: parsed || {}, body: match[2] };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

export function SpecPopout(): React.ReactElement {
  const [content, setContent] = useState('');
  const [showLaunch, setShowLaunch] = useState(false);

  // Launch panel state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [description, setDescription] = useState('');
  const [gitStrategy, setGitStrategy] = useState<GitStrategy | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Apply dark theme to :root
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleOpenLaunch = useCallback(async () => {
    setError(null);
    setSuccess(false);

    const [ws, wf] = await Promise.all([
      window.athanor.invoke('db:list-workspaces' as never) as Promise<Workspace[]>,
      window.athanor.invoke('workflow:list' as never) as Promise<Workflow[]>,
    ]);
    setWorkspaces(ws);
    setWorkflows(wf);

    const { frontmatter } = parseFrontmatter(content);

    if (frontmatter.description) setDescription(frontmatter.description);
    if (frontmatter.git_strategy) setGitStrategy(frontmatter.git_strategy);

    if (frontmatter.workspace) {
      const match = ws.find(
        (w) => w.name.toLowerCase() === frontmatter.workspace!.toLowerCase(),
      );
      setSelectedWorkspace(match?.id || '');
    } else {
      setSelectedWorkspace('');
    }

    if (frontmatter.workflow) {
      const match = wf.find(
        (w) => w.name.toLowerCase() === frontmatter.workflow!.toLowerCase(),
      );
      setSelectedWorkflow(match?.id || '');
    } else {
      setSelectedWorkflow('');
    }

    setShowLaunch(true);
  }, [content]);

  const handleLaunch = useCallback(async () => {
    if (!selectedWorkspace || !selectedWorkflow) return;
    setLaunching(true);
    setError(null);
    try {
      const { body } = parseFrontmatter(content);
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string };
      await window.athanor.invoke('session:start' as never, {
        userId: user.id,
        workspaceId: selectedWorkspace,
        workflowId: selectedWorkflow,
        description: description || undefined,
        context: body || undefined,
        gitStrategy: gitStrategy || undefined,
      });
      setShowLaunch(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLaunching(false);
    }
  }, [content, selectedWorkspace, selectedWorkflow, description, gitStrategy]);

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-text-primary font-sans">
      {/* Draggable title bar region */}
      <div
        className="flex items-center justify-between px-4 py-2 select-none border-b border-border-subtle"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs font-medium text-text-secondary tracking-wide uppercase">
          Spec Editor
        </span>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {success && (
            <span className="text-[0.75rem] text-status-success animate-fade-in">
              Session launched
            </span>
          )}
          <button
            onClick={handleOpenLaunch}
            title="Launch session from spec"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-accent-ember hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <Rocket size={12} strokeWidth={1.75} />
            <span>Launch</span>
          </button>
        </div>
      </div>

      {/* Launch panel */}
      {showLaunch && (
        <div className="p-4 pb-0 animate-fade-in">
          <div className="card card-static p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[0.875rem] font-semibold text-text-primary flex items-center gap-2.5">
                <Rocket size={15} className="text-accent-ember" />
                Launch from Spec
              </div>
              <button onClick={() => setShowLaunch(false)} className="btn-icon !w-7 !h-7">
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

            <div className="grid grid-cols-2 gap-3 mb-3">
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

            <div className="mb-3">
              <div className="text-[0.6875rem] text-text-tertiary mb-1.5">Git Strategy</div>
              <GitStrategyPicker
                value={gitStrategy}
                onChange={setGitStrategy}
                workspaceId={selectedWorkspace || undefined}
              />
            </div>

            {error && (
              <div className="text-[0.75rem] text-status-failed mb-3 p-2.5 rounded-md bg-surface-2 border border-border-default">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleLaunch}
                disabled={launching || !selectedWorkspace || !selectedWorkflow}
                className="btn-primary flex items-center gap-1.5"
              >
                <Rocket size={13} />
                {launching ? 'Launching...' : 'Confirm Launch'}
              </button>
              <button onClick={() => setShowLaunch(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 p-4">
        <div className="h-full rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
          <TransparentMarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Write your specification here..."
            autoFocus
            fillHeight
            normalTextareaClassName="w-full h-full p-6 bg-surface-1 border-none text-text-primary text-[0.875rem] font-mono leading-relaxed resize-none outline-none"
            transparentContainerClassName="relative h-full"
            transparentPreviewStyle={{
              height: '100%',
              overflow: 'auto',
              padding: 24,
              fontSize: '0.875rem',
              lineHeight: 1.7,
            }}
            transparentTextareaStyle={{
              padding: 24,
              fontSize: '0.875rem',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              resize: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
