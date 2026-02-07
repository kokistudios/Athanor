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
  const [editRepoId, setEditRepoId] = useState('');
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
        setEditRepoId((ws as Workspace).repo_id);
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
    if (!editName.trim() || !editRepoId) return;
    setSaving(true);
    try {
      await window.athanor.invoke('db:update-workspace' as never, {
        id: workspaceId,
        name: editName.trim(),
        repoId: editRepoId,
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

      if (editing) {
        // In edit mode: add to local list and select, user will save via Edit flow
        setRepos((prev) => [repo, ...prev]);
        setEditRepoId(repo.id);
      } else {
        // In view mode: assign immediately
        await window.athanor.invoke('db:update-workspace' as never, {
          id: workspaceId,
          repoId: repo.id,
        });
      }

      setShowAddRepo(false);
      setNewRepoPath('');
      setNewRepoName('');
      if (!editing) loadWorkspace();
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingRepo(false);
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
                    setEditRepoId(workspace.repo_id);
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

          {/* Repository section */}
          <div className="mb-8">
            <h3 className="text-[0.75rem] font-semibold tracking-[0.04em] uppercase text-text-tertiary mb-4 flex items-center gap-2">
              <GitBranch size={13} strokeWidth={2} />
              Repository
            </h3>

            {editing ? (
              <div>
                <div className="flex gap-2 items-center mb-2">
                  <select
                    value={editRepoId}
                    onChange={(e) => setEditRepoId(e.target.value)}
                    className="input-base flex-1 text-[0.875rem] py-2.5 px-3"
                  >
                    <option value="">Select repository...</option>
                    {repos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} — {r.local_path}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowAddRepo(!showAddRepo)}
                    className="btn-secondary whitespace-nowrap text-[0.75rem]"
                  >
                    <Plus size={12} className="inline mr-1" />
                    Add Repo
                  </button>
                </div>
                {showAddRepo && (
                  <div className="p-3 border border-border-subtle rounded-md bg-surface-1 mb-2">
                    <div className="flex gap-2 items-center mb-1.5">
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
                      placeholder="Repo name (optional — derived from path)"
                      className="input-base w-full mb-2 text-[0.875rem] py-2 px-3"
                    />
                    {repoError && (
                      <div className="text-[0.8125rem] text-status-failed mb-2">{repoError}</div>
                    )}
                    <button
                      onClick={handleAddRepo}
                      disabled={addingRepo || !newRepoPath.trim()}
                      className="btn-primary text-[0.75rem]"
                    >
                      {addingRepo ? 'Adding...' : 'Add & Select Repo'}
                    </button>
                  </div>
                )}
              </div>
            ) : workspace.repo ? (
              <div className="card card-static card-accent-left p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-md bg-surface-3 flex items-center justify-center flex-shrink-0">
                    <GitBranch size={14} strokeWidth={2} className="text-text-secondary" />
                  </div>
                  <div className="font-semibold text-[0.9375rem] text-text-primary">
                    {workspace.repo.name}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-11">
                  <div className="flex items-center gap-2">
                    <FolderGit2
                      size={12}
                      strokeWidth={2}
                      className="text-text-tertiary flex-shrink-0"
                    />
                    <span className="text-[0.8125rem] text-text-secondary font-mono">
                      {workspace.repo.local_path}
                    </span>
                  </div>
                  {workspace.repo.remote_url && (
                    <div className="flex items-center gap-2">
                      <Globe
                        size={12}
                        strokeWidth={2}
                        className="text-text-tertiary flex-shrink-0"
                      />
                      <span className="text-[0.8125rem] text-text-tertiary">
                        {workspace.repo.remote_url}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card card-static p-6 text-center">
                <div className="text-text-tertiary text-[0.875rem]">No repository assigned.</div>
              </div>
            )}

            {!editing && (
              <button
                onClick={() => setShowAddRepo(!showAddRepo)}
                className="btn-ghost mt-3 text-[0.8125rem] flex items-center gap-1.5"
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
            )}

            {!editing && showAddRepo && (
              <div className="card card-static p-6 mt-3 animate-fade-in">
                <div className="text-[0.875rem] text-text-secondary mb-4 font-medium">
                  Select an existing repo or add a new one
                </div>
                <div className="flex flex-wrap gap-2.5 mb-5">
                  {repos
                    .filter((r) => r.id !== workspace.repo_id)
                    .map((r) => (
                      <button
                        key={r.id}
                        onClick={async () => {
                          await window.athanor.invoke('db:update-workspace' as never, {
                            id: workspaceId,
                            repoId: r.id,
                          });
                          setShowAddRepo(false);
                          loadWorkspace();
                        }}
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
                    {addingRepo ? 'Adding...' : 'Add & Assign Repo'}
                  </button>
                </div>
              </div>
            )}
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
