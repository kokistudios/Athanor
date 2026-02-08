import React, { useState, useCallback } from 'react';
import { parse as parseYaml } from 'yaml';
import { TransparentMarkdownEditor } from '../shared/TransparentMarkdownEditor';
import { GitStrategyPicker } from '../shared/GitStrategyPicker';
import { NotebookPen, ExternalLink, Rocket, X } from 'lucide-react';
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

export function SpecEditor(): React.ReactElement {
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

  const handlePopout = useCallback(() => {
    window.athanor.invoke('window:open-spec-popout' as never);
  }, []);

  const handleOpenLaunch = useCallback(async () => {
    setError(null);
    setSuccess(false);

    // Load workspaces and workflows
    const [ws, wf] = await Promise.all([
      window.athanor.invoke('db:list-workspaces' as never) as Promise<Workspace[]>,
      window.athanor.invoke('workflow:list' as never) as Promise<Workflow[]>,
    ]);
    setWorkspaces(ws);
    setWorkflows(wf);

    // Parse frontmatter and pre-fill
    const { frontmatter } = parseFrontmatter(content);

    if (frontmatter.description) setDescription(frontmatter.description);
    if (frontmatter.git_strategy) setGitStrategy(frontmatter.git_strategy);

    // Resolve workspace name → ID
    if (frontmatter.workspace) {
      const match = ws.find(
        (w) => w.name.toLowerCase() === frontmatter.workspace!.toLowerCase(),
      );
      setSelectedWorkspace(match?.id || '');
    } else {
      setSelectedWorkspace('');
    }

    // Resolve workflow name → ID
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
    <div className="flex flex-col h-full">
      <div className="px-5 md:px-8">
        <div className="page-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NotebookPen size={18} strokeWidth={1.75} className="text-accent-ember" />
            <h2>Spec Editor</h2>
          </div>
          <div className="flex items-center gap-2">
            {success && (
              <span className="text-[0.75rem] text-status-success animate-fade-in">
                Session launched
              </span>
            )}
            <button
              onClick={handleOpenLaunch}
              title="Launch session from spec"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-accent-ember hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <Rocket size={13} strokeWidth={1.75} />
              <span>Launch</span>
            </button>
            <button
              onClick={handlePopout}
              title="Pop out into separate window"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <ExternalLink size={13} strokeWidth={1.75} />
              <span>Pop out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Launch panel */}
      {showLaunch && (
        <div className="px-5 md:px-8 mb-3 animate-fade-in">
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

      <div className="flex-1 min-h-0 px-5 md:px-8 pb-5 md:pb-8">
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
