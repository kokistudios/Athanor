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
  X,
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
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [showNewRepo, setShowNewRepo] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-workspace repo cache for display on cards
  const [workspaceRepoNames, setWorkspaceRepoNames] = useState<Record<string, string[]>>({});

  const loadData = useCallback(async () => {
    try {
      const [ws, rp] = await Promise.all([
        window.athanor.invoke('db:list-workspaces' as never),
        window.athanor.invoke('db:list-repos' as never),
      ]);
      setWorkspaces(ws as Workspace[]);
      setRepos(rp as Repo[]);

      // Load repo names for each workspace
      const repoNamesMap: Record<string, string[]> = {};
      for (const w of ws as Workspace[]) {
        try {
          const wsRepos = (await window.athanor.invoke(
            'db:workspace-repos' as never,
            w.id,
          )) as Repo[];
          repoNamesMap[w.id] = wsRepos.map((r) => r.name);
        } catch {
          // Fall back to legacy single repo
          const repo = (rp as Repo[]).find((r) => r.id === w.repo_id);
          repoNamesMap[w.id] = repo ? [repo.name] : [];
        }
      }
      setWorkspaceRepoNames(repoNamesMap);
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
      setSelectedRepos((prev) => [...prev, repo.id]);
      setShowNewRepo(false);
      setNewRepoPath('');
      setNewRepoName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingRepo(false);
    }
  };

  const handleAddExistingRepo = (repoId: string) => {
    if (!selectedRepos.includes(repoId)) {
      setSelectedRepos((prev) => [...prev, repoId]);
    }
  };

  const handleRemoveSelectedRepo = (repoId: string) => {
    setSelectedRepos((prev) => prev.filter((id) => id !== repoId));
  };

  const handleCreate = async () => {
    if (!newName.trim() || selectedRepos.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const user = (await window.athanor.invoke('db:get-user' as never)) as { id: string };
      const ws = (await window.athanor.invoke('db:create-workspace' as never, {
        userId: user.id,
        repoIds: selectedRepos,
        name: newName.trim(),
      })) as Workspace;
      setShowCreate(false);
      setNewName('');
      setSelectedRepos([]);
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
                Repositories
              </div>

              {/* Selected repos as removable chips */}
              {selectedRepos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedRepos.map((repoId) => {
                    const r = repos.find((repo) => repo.id === repoId);
                    if (!r) return null;
                    return (
                      <span
                        key={repoId}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-3 text-[0.75rem] text-text-secondary"
                      >
                        <GitBranch size={10} strokeWidth={2} className="text-text-tertiary" />
                        {r.name}
                        <button
                          onClick={() => handleRemoveSelectedRepo(repoId)}
                          className="ml-0.5 text-text-tertiary hover:text-text-primary transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 items-center mb-2">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleAddExistingRepo(e.target.value);
                  }}
                  className="input-base flex-1"
                >
                  <option value="">Add a repo...</option>
                  {repos
                    .filter((r) => !selectedRepos.includes(r.id))
                    .map((r) => (
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
                  New Repo
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
                disabled={creating || !newName.trim() || selectedRepos.length === 0}
                className="btn-primary"
              >
                {creating ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          )}

          {loading && <div className="text-text-tertiary text-[0.8125rem] mt-4">Loading...</div>}

          <div className="stagger-children">
            {workspaces.map((ws) => {
              const repoNames = workspaceRepoNames[ws.id] || [];
              const repoDisplay =
                repoNames.length <= 3
                  ? repoNames.join(', ')
                  : `${repoNames.slice(0, 3).join(', ')} +${repoNames.length - 3}`;
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
                      {repoNames.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <GitBranch size={11} strokeWidth={2} className="text-text-tertiary" />
                          <span className="text-[0.75rem] text-text-secondary truncate">
                            {repoDisplay}
                          </span>
                          {repoNames.length > 1 && (
                            <span className="text-[0.625rem] text-text-tertiary opacity-60">
                              {repoNames.length} repos
                            </span>
                          )}
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
