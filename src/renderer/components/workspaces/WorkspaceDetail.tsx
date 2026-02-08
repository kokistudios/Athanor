import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Save,
  X,
  Plus,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Clock,
  Globe,
  Settings,
} from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface Repo {
  id: string;
  name: string;
  local_path: string;
  remote_url: string | null;
  created_at: string;
}

interface Workspace {
  id: string;
  name: string;
  repo_id: string;
  config: string | null;
  created_at: string;
  repo?: Repo;
  repos?: Repo[];
}

interface WorkspaceDetailProps {
  workspaceId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function WorkspaceDetail({
  workspaceId,
  onBack,
  onDeleted,
}: WorkspaceDetailProps): React.ReactElement {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadWorkspace = async () => {
    try {
      const [ws, rp] = await Promise.all([
        window.athanor.invoke('db:get-workspace' as never, workspaceId),
        window.athanor.invoke('db:list-repos' as never),
      ]);
      setWorkspace(ws as Workspace);
      setRepos(rp as Repo[]);
      if (ws) {
        setEditName((ws as Workspace).name);
      }
    } catch (err) {
      console.error('Failed to load workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await window.athanor.invoke('db:update-workspace' as never, {
        id: workspaceId,
        name: editName.trim(),
      });
      setEditing(false);
      loadWorkspace();
    } catch (err) {
      console.error('Failed to update workspace:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await window.athanor.invoke('db:delete-workspace' as never, workspaceId);
      onDeleted();
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

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
    setRepoError(null);
    try {
      const repo = (await window.athanor.invoke('db:add-repo' as never, {
        name: newRepoName.trim() || newRepoPath.split('/').filter(Boolean).pop() || 'repo',
        localPath: newRepoPath.trim(),
      })) as Repo;

      // Add to workspace via join table
      await window.athanor.invoke('db:workspace-add-repo' as never, {
        workspaceId,
        repoId: repo.id,
      });

      setRepos((prev) => [repo, ...prev]);
      setShowAddRepo(false);
      setNewRepoPath('');
      setNewRepoName('');
      loadWorkspace();
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingRepo(false);
    }
  };

  const handleAddExistingRepoToWorkspace = async (repoId: string) => {
    try {
      await window.athanor.invoke('db:workspace-add-repo' as never, {
        workspaceId,
        repoId,
      });
      setShowAddRepo(false);
      loadWorkspace();
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveRepoFromWorkspace = async (repoId: string) => {
    const wsRepos = workspace?.repos || (workspace?.repo ? [workspace.repo] : []);
    if (wsRepos.length <= 1) return; // Can't remove last repo
    try {
      await window.athanor.invoke('db:workspace-remove-repo' as never, {
        workspaceId,
        repoId,
      });
      loadWorkspace();
    } catch (err) {
      console.error('Failed to remove repo:', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-text-tertiary text-[0.875rem]">Loading...</div>;
  }

  if (!workspace) {
    return (
      <div className="p-8">
        <button onClick={onBack} className="btn-secondary mb-4">
          Back
        </button>
        <div className="text-text-secondary text-[0.875rem]">Workspace not found.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="page-header">
        <button
          onClick={onBack}
          className="btn-ghost flex items-center gap-1.5 !px-0 !py-0 text-[0.75rem] mb-2"
        >
          <ArrowLeft size={13} />
          Back to workspaces
        </button>
        <div className="flex items-center gap-3">
          <FolderGit2 size={18} strokeWidth={1.75} className="text-accent-ember" />
          {!editing ? (
            <>
              <h2>{workspace.name}</h2>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditing(true);
                    setShowAddRepo(false);
                  }}
                  className="btn-ghost flex items-center gap-1.5"
                >
                  <Pencil size={13} strokeWidth={2} />
                  <span className="text-[0.75rem]">Edit</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-ghost flex items-center gap-1.5 text-status-failed"
                >
                  <Trash2 size={13} strokeWidth={2} />
                  <span className="text-[0.75rem]">Delete</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input-base flex-1 max-w-[420px] text-[0.9375rem]"
              />
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Save size={12} /> {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setShowAddRepo(false);
                    setEditName(workspace.name);
                  }}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-7 scrollbar-thin">
        <div className="content-area">
          {/* Overview card */}
          <div className="card card-static p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent-glow flex items-center justify-center flex-shrink-0">
                <FolderGit2 size={18} strokeWidth={1.75} className="text-accent-ember" />
              </div>
              <div>
                <div className="text-[0.9375rem] font-semibold text-text-primary">
                  {workspace.name}
                </div>
                <div className="card-meta mt-0.5">
                  <span className="flex items-center gap-1.5">
                    <Clock size={10} strokeWidth={2} />
                    Created {new Date(workspace.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Repositories section */}
          <div className="mb-8">
            <h3 className="text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary mb-4 flex items-center gap-2">
              <GitBranch size={13} strokeWidth={2} />
              Repositories
            </h3>

            {/* Repo list */}
            {(() => {
              const wsRepos = workspace.repos && workspace.repos.length > 0
                ? workspace.repos
                : workspace.repo
                  ? [workspace.repo]
                  : [];
              const wsRepoIds = new Set(wsRepos.map((r) => r.id));

              return (
                <div>
                  {wsRepos.length > 0 ? (
                    <div className="flex flex-col gap-2 mb-3">
                      {wsRepos.map((repo) => (
                        <div key={repo.id} className="card card-static card-accent-left p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-surface-3 flex items-center justify-center flex-shrink-0">
                              <GitBranch size={14} strokeWidth={2} className="text-text-secondary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-[0.875rem] text-text-primary">
                                {repo.name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <FolderGit2
                                  size={11}
                                  strokeWidth={2}
                                  className="text-text-tertiary flex-shrink-0"
                                />
                                <span className="text-[0.75rem] text-text-secondary font-mono truncate">
                                  {repo.local_path}
                                </span>
                              </div>
                              {repo.remote_url && (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Globe
                                    size={11}
                                    strokeWidth={2}
                                    className="text-text-tertiary flex-shrink-0"
                                  />
                                  <span className="text-[0.75rem] text-text-tertiary truncate">
                                    {repo.remote_url}
                                  </span>
                                </div>
                              )}
                            </div>
                            {wsRepos.length > 1 && (
                              <button
                                onClick={() => handleRemoveRepoFromWorkspace(repo.id)}
                                className="btn-ghost !p-1.5 text-text-tertiary hover:text-status-failed transition-colors"
                                title="Remove from workspace"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card card-static p-6 text-center mb-3">
                      <div className="text-text-tertiary text-[0.875rem]">No repositories assigned.</div>
                    </div>
                  )}

                  {/* Add repo button */}
                  <button
                    onClick={() => setShowAddRepo(!showAddRepo)}
                    className="btn-ghost text-[0.8125rem] flex items-center gap-1.5"
                  >
                    {showAddRepo ? (
                      <>
                        <X size={13} /> Cancel
                      </>
                    ) : (
                      <>
                        <Plus size={13} /> Add Repo
                      </>
                    )}
                  </button>

                  {showAddRepo && (
                    <div className="card card-static p-6 mt-3 animate-fade-in">
                      {/* Existing repos not yet in workspace */}
                      {repos.filter((r) => !wsRepoIds.has(r.id)).length > 0 && (
                        <>
                          <div className="text-[0.875rem] text-text-secondary mb-3 font-medium">
                            Add an existing repo
                          </div>
                          <div className="flex flex-wrap gap-2.5 mb-5">
                            {repos
                              .filter((r) => !wsRepoIds.has(r.id))
                              .map((r) => (
                                <button
                                  key={r.id}
                                  onClick={() => handleAddExistingRepoToWorkspace(r.id)}
                                  className="card p-4 text-left cursor-pointer hover:border-accent-ember transition-colors duration-100"
                                >
                                  <div className="text-[0.875rem] font-medium text-text-primary">
                                    {r.name}
                                  </div>
                                  <div className="text-[0.75rem] text-text-tertiary font-mono mt-1">
                                    {r.local_path}
                                  </div>
                                </button>
                              ))}
                          </div>
                        </>
                      )}

                      <div className="border-t border-border-subtle pt-4">
                        <div className="text-[0.75rem] font-medium text-text-tertiary mb-2 uppercase tracking-[0.03em]">
                          Add new repo
                        </div>
                        <div className="flex gap-2 items-center mb-2">
                          <input
                            type="text"
                            value={newRepoPath}
                            onChange={(e) => setNewRepoPath(e.target.value)}
                            placeholder="Local path (e.g. /Users/you/projects/my-app)"
                            className="input-base flex-1 text-[0.875rem] py-2 px-3"
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
                          placeholder="Repo name (optional)"
                          className="input-base w-full mb-3 text-[0.875rem] py-2 px-3"
                        />
                        {repoError && (
                          <div className="text-[0.8125rem] text-status-failed mb-3">{repoError}</div>
                        )}
                        <button
                          onClick={handleAddRepo}
                          disabled={addingRepo || !newRepoPath.trim()}
                          className="btn-primary flex items-center gap-1.5"
                        >
                          <Plus size={13} />
                          {addingRepo ? 'Adding...' : 'Add Repo'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Config section */}
          {workspace.config && (
            <div className="mb-8">
              <h3 className="text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary mb-4 flex items-center gap-2">
                <Settings size={13} strokeWidth={2} />
                Configuration
              </h3>
              <div className="card card-static p-6">
                <pre className="bg-code-bg border border-code-border rounded-md p-4 text-[0.8125rem] text-text-secondary overflow-auto font-mono leading-relaxed">
                  {JSON.stringify(JSON.parse(workspace.config), null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Workspace"
        description={`"${workspace.name}" will be permanently deleted.`}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
