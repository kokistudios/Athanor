import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { GitStrategy } from '../../../shared/types/workflow-phase';

interface GitStrategyPickerProps {
  value: GitStrategy | null;
  onChange: (v: GitStrategy | null) => void;
  workspaceId?: string;
}

type PickerMode = 'worktree' | 'main' | 'branch';

function strategyToMode(strategy: GitStrategy | null): PickerMode {
  if (!strategy) return 'worktree';
  return strategy.mode;
}

function modeToStrategy(
  mode: PickerMode,
  branchState: { branch: string; isolation: 'worktree' | 'in_place'; create: boolean },
): GitStrategy | null {
  switch (mode) {
    case 'worktree':
      return { mode: 'worktree' };
    case 'main':
      return { mode: 'main' };
    case 'branch':
      return {
        mode: 'branch',
        branch: branchState.branch,
        isolation: branchState.isolation,
        create: branchState.create,
      };
  }
}

export function GitStrategyPicker({
  value,
  onChange,
  workspaceId,
}: GitStrategyPickerProps): React.ReactElement {
  const [mode, setMode] = useState<PickerMode>(() => strategyToMode(value));
  const [branch, setBranch] = useState(value?.mode === 'branch' ? value.branch : '');
  const [isolation, setIsolation] = useState<'worktree' | 'in_place'>(
    value?.mode === 'branch' ? value.isolation : 'worktree',
  );
  const [create, setCreate] = useState(value?.mode === 'branch' ? value.create : true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Sync internal state when value prop changes (e.g. after async load)
  useEffect(() => {
    const newMode = strategyToMode(value);
    setMode(newMode);
    if (value?.mode === 'branch') {
      setBranch(value.branch);
      setIsolation(value.isolation);
      setCreate(value.create);
    }
  }, [value?.mode, value?.mode === 'branch' ? value.branch : '']);

  // Load branch suggestions when workspace changes
  useEffect(() => {
    if (!workspaceId) {
      setSuggestions([]);
      return;
    }
    const loadBranches = async () => {
      try {
        const result = await window.athanor.invoke(
          'repo:list-branches' as never,
          workspaceId,
        );

        if (Array.isArray(result)) {
          // Single repo: flat string[]
          setSuggestions(result as string[]);
        } else if (result && typeof result === 'object') {
          // Multi repo: Record<repoId, { repoName, branches[] }>
          const multiResult = result as Record<string, { repoName: string; branches: string[] }>;
          const allBranches = new Set<string>();
          for (const entry of Object.values(multiResult)) {
            for (const b of entry.branches) {
              allBranches.add(b);
            }
          }
          setSuggestions(Array.from(allBranches));
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      }
    };
    void loadBranches();
  }, [workspaceId]);

  const emitChange = useCallback(
    (m: PickerMode, b: string, iso: 'worktree' | 'in_place', cr: boolean) => {
      onChange(modeToStrategy(m, { branch: b, isolation: iso, create: cr }));
    },
    [onChange],
  );

  const handleModeChange = (newMode: PickerMode) => {
    setMode(newMode);
    emitChange(newMode, branch, isolation, create);
  };

  const handleBranchChange = (newBranch: string) => {
    setBranch(newBranch);
    emitChange(mode, newBranch, isolation, create);
  };

  const handleIsolationChange = (newIsolation: 'worktree' | 'in_place') => {
    setIsolation(newIsolation);
    emitChange(mode, branch, newIsolation, create);
  };

  const handleCreateChange = (newCreate: boolean) => {
    setCreate(newCreate);
    emitChange(mode, branch, isolation, newCreate);
  };

  const filteredSuggestions = branch
    ? suggestions.filter((s) => s.toLowerCase().includes(branch.toLowerCase()) && s !== branch)
    : suggestions;

  return (
    <div>
      <div className="phase-select-wrap">
        <select
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as PickerMode)}
          className="phase-select"
        >
          <option value="worktree">Worktree (isolated)</option>
          <option value="main">Main (in-place)</option>
          <option value="branch">Named branch</option>
        </select>
      </div>

      {mode === 'branch' && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={branch}
              onChange={(e) => handleBranchChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Branch name"
              className="phase-input"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  maxHeight: 160,
                  overflowY: 'auto',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 6,
                  marginTop: 2,
                }}
              >
                {filteredSuggestions.slice(0, 20).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleBranchChange(s);
                      setCreate(false);
                      emitChange(mode, s, isolation, false);
                      setShowSuggestions(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '5px 10px',
                      fontSize: '0.8125rem',
                      color: 'var(--color-text-secondary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    className="hover:bg-surface-3"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={create}
                onChange={(e) => handleCreateChange(e.target.checked)}
              />
              Create new branch
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="branch-isolation"
                checked={isolation === 'worktree'}
                onChange={() => handleIsolationChange('worktree')}
              />
              Worktree
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="branch-isolation"
                checked={isolation === 'in_place'}
                onChange={() => handleIsolationChange('in_place')}
              />
              In-place
            </label>
          </div>

          {isolation === 'in_place' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.6875rem',
                color: 'var(--color-status-failed)',
              }}
            >
              <AlertTriangle size={12} />
              Runs directly in your repo. Only one in-place agent per workspace.
            </div>
          )}
        </div>
      )}

      {mode === 'main' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.6875rem',
            color: 'var(--color-status-failed)',
            marginTop: 6,
          }}
        >
          <AlertTriangle size={12} />
          Runs directly in your repo on the current branch.
        </div>
      )}
    </div>
  );
}
