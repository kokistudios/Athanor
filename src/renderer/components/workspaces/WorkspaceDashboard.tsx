import React, { useState, useEffect, useCallback } from 'react';
import { WorkspaceDetail } from './WorkspaceDetail';
import {
  Plus,
  FolderGit2,
  FolderOpen,
  Orbit,
  Clock,
  GitBranch,
  ChevronRight,
} from 'lucide-react';

interface Repo {
  id: string;
  name: string;
  local_path: string;
  remote_url: string | null;
}

interface Workspace {
  id: string;
  name: string;
  repo_id: string;
  config: string | null;
  created_at: string;
}

interface WorkspaceDashboardProps {
  selectedWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
}

export function WorkspaceDashboard({
  selectedWorkspaceId,
  onSelectWorkspace,
}: WorkspaceDashboardProps): React.ReactElement {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [creating, setCreating] = useState(false);

  const [showNewRepo, setShowNewRepo] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [ws, rp] = await Promise.all([
        window.athanor.invoke('db:list-workspaces' as never),
        window.athanor.invoke('db:list-repos' as never),
      ]);
      setWorkspaces(ws as Workspace[]);
      setRepos(rp as Repo[]);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pickFolder = async () => {
    const folder = (await window.athanor.invoke('shell:pick-folder' as never)) as string | null;
    if (folder) {
      setNewRepoPath(folder);
      if (!newRepoName.trim()) {
        setNewRepoName(folder.split('/').filter(Boolean).pop() || '');
      }
    }
  };

  const handleAddRepo = async () => {
    if (!newRepoPath.trim()) return;
    setAddingRepo(true);
    setError(null);
    try {
      const repo = (await window.athanor.invoke('db:add-repo' as never, {
        name: newRepoName.trim() || newRepoPath.split('/').filter(Boolean).pop() || 'repo',
        localPath: newRepoPath.trim(),
      })) as Repo;
      setRepos((prev) => [repo, ...prev]);
      setSelectedRepo(repo.id);
      setShowNewRepo(false);
      setNewRepoPath('');
      setNewRepoName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingRepo(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedRepo) return;
    setCreating(true);
    setError(null);
    try {
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string };
      const ws = (await window.athanor.invoke('db:create-workspace' as never, {
        userId: user.id,
        repoId: selectedRepo,
        name: newName.trim(),
      })) as Workspace;
      setShowCreate(false);
      setNewName('');
      setSelectedRepo('');
      await loadData();
      onSelectWorkspace(ws.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  if (selectedWorkspaceId) {
    return (
      <WorkspaceDetail
        workspaceId={selectedWorkspaceId}
        onBack={() => onSelectWorkspace('')}
        onDeleted={() => {
          onSelectWorkspace('');
          loadData();
        }}
      />
    );
  }

  const repoById = new Map(repos.map((r) => [r.id, r]));

  return (
    <div className="flex flex-col h-full">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Orbit size={18} strokeWidth={1.75} className="text-accent-ember" />
          <h2>Workspaces</h2>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={showCreate ? 'btn-secondary' : 'btn-primary flex items-center gap-1.5'}
        >
          {showCreate ? (
            'Cancel'
          ) : (
            <>
              <Plus size={14} /> New Workspace
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          {/* Create form */}
          {showCreate && (
            <div className="card card-static p-4 mb-4 animate-fade-in">
              <div className="text-[0.8125rem] font-semibold text-text-primary mb-3 flex items-center gap-2">
                <FolderGit2 size={14} className="text-accent-ember" />
                Create Workspace
              </div>

              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Workspace name (e.g. backend-api)"
                className="input-base w-full mb-3"
              />

              <div className="text-[0.6875rem] font-medium text-text-tertiary mb-1.5 uppercase tracking-[0.04em]">
                Repository
              </div>
              <div className="flex gap-2 items-center mb-2">
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="input-base flex-1"
                >
                  <option value="">Select repo...</option>
                  {repos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.local_path}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewRepo(!showNewRepo)}
                  className="btn-secondary whitespace-nowrap text-[0.75rem]"
                >
                  <Plus size={12} className="inline mr-1" />
                  Add Repo
                </button>
              </div>

              {showNewRepo && (
                <div className="p-3 border border-border-subtle rounded-md bg-surface-1 mb-3">
                  <div className="flex gap-2 items-center mb-1.5">
                    <input
                      type="text"
                      value={newRepoPath}
                      onChange={(e) => setNewRepoPath(e.target.value)}
                      placeholder="Local path (e.g. /Users/you/projects/my-app)"
                      className="input-base flex-1"
                    />
                    <button
                      onClick={pickFolder}
                      className="btn-secondary flex items-center gap-1 whitespace-nowrap text-[0.75rem]"
                      title="Browse..."
                    >
                      <FolderOpen size={13} />
                      Browse
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="Repo name (optional — derived from path)"
                    className="input-base w-full mb-2"
                  />
                  <button
                    onClick={handleAddRepo}
                    disabled={addingRepo || !newRepoPath.trim()}
                    className="btn-primary text-[0.75rem]"
                  >
                    {addingRepo ? 'Adding...' : 'Add Repo'}
                  </button>
                </div>
              )}

              {error && <div className="text-[0.75rem] text-status-failed mb-2">{error}</div>}

              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !selectedRepo}
                className="btn-primary"
              >
                {creating ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          )}

          {loading && <div className="text-text-tertiary text-[0.8125rem] mt-4">Loading...</div>}

          <div className="stagger-children">
            {workspaces.map((ws) => {
              const repo = repoById.get(ws.repo_id);
              return (
                <div
                  key={ws.id}
                  className="card card-accent-left card-flush mb-3 group cursor-pointer"
                  onClick={() => onSelectWorkspace(ws.id)}
                >
                  <div className="relative z-[1] p-6 pl-7 flex items-center gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent-glow flex items-center justify-center">
                      <FolderGit2 size={16} strokeWidth={1.75} className="text-accent-ember" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="card-title">{ws.name}</div>
                      {repo && (
                        <div className="flex items-center gap-2 mt-1">
                          <GitBranch size={11} strokeWidth={2} className="text-text-tertiary" />
                          <span className="text-[0.75rem] text-text-secondary">{repo.name}</span>
                          <span className="font-mono text-[0.625rem] text-text-tertiary opacity-60 truncate">
                            {repo.local_path}
                          </span>
                        </div>
                      )}
                      <div className="card-meta mt-1.5">
                        <span className="flex items-center gap-1.5">
                          <Clock size={10} strokeWidth={2} />
                          Created {new Date(ws.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ChevronRight
                        size={14}
                        strokeWidth={2}
                        className="text-text-tertiary opacity-0 group-hover:opacity-60 transition-opacity duration-150"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && workspaces.length === 0 && !showCreate && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Orbit size={22} strokeWidth={1.5} />
              </div>
              <div className="empty-state-title">No workspaces yet</div>
              <div className="empty-state-desc">
                Create a workspace to link a repository with your sessions.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
