import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  dir: string;
  branch: string;
}

export interface MultiRepoWorktreeEntry {
  repoId: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
}

export interface MultiRepoWorktreeResult {
  sessionDir: string;
  repos: MultiRepoWorktreeEntry[];
}

export class WorktreeManager {
  private worktreeBase: string;

  constructor(dataDir: string) {
    this.worktreeBase = path.join(dataDir, 'worktrees');
  }

  async createWorktree(repoPath: string, taskName: string): Promise<WorktreeInfo> {
    const shortId = crypto.randomUUID().slice(0, 8);
    const safeName = taskName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const branch = `athanor/${safeName}-${shortId}`;
    const dir = path.join(this.worktreeBase, `${safeName}-${shortId}`);

    await execFileAsync('git', ['worktree', 'add', dir, '-b', branch], {
      cwd: repoPath,
    });

    return { dir, branch };
  }

  async removeWorktree(repoPath: string, dir: string): Promise<void> {
    await execFileAsync('git', ['worktree', 'remove', dir, '--force'], {
      cwd: repoPath,
    });
  }

  async listBranches(repoPath: string): Promise<string[]> {
    const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], {
      cwd: repoPath,
    });
    return stdout
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);
  }

  async createWorktreeFromBranch(
    repoPath: string,
    branchName: string,
    taskName: string,
    createBranch: boolean,
  ): Promise<WorktreeInfo> {
    const shortId = crypto.randomUUID().slice(0, 8);
    const safeName = taskName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const dir = path.join(this.worktreeBase, `${safeName}-${shortId}`);

    if (createBranch) {
      await execFileAsync('git', ['worktree', 'add', dir, '-b', branchName], {
        cwd: repoPath,
      });
    } else {
      await execFileAsync('git', ['worktree', 'add', dir, branchName], {
        cwd: repoPath,
      });
    }

    return { dir, branch: branchName };
  }

  async checkoutBranch(repoPath: string, branchName: string, create: boolean): Promise<void> {
    // Check current branch — no-op if already on it
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoPath,
      });
      if (stdout.trim() === branchName) return;
    } catch {
      // ignore — proceed with checkout
    }

    if (create) {
      await execFileAsync('git', ['checkout', '-b', branchName], { cwd: repoPath });
    } else {
      await execFileAsync('git', ['checkout', branchName], { cwd: repoPath });
    }
  }

  async createMultiRepoWorktrees(
    repos: Array<{ repoId: string; repoPath: string; repoName: string }>,
    taskName: string,
  ): Promise<MultiRepoWorktreeResult> {
    const shortId = crypto.randomUUID().slice(0, 8);
    const safeName = taskName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const sessionDir = path.join(this.worktreeBase, `${safeName}-${shortId}`);

    await fs.mkdir(sessionDir, { recursive: true });

    const created: MultiRepoWorktreeEntry[] = [];

    for (const repo of repos) {
      const safeRepoName = repo.repoName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const branch = `athanor/${safeName}-${safeRepoName}-${shortId}`;
      const worktreePath = path.join(sessionDir, safeRepoName);

      try {
        await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', branch], {
          cwd: repo.repoPath,
        });
        created.push({
          repoId: repo.repoId,
          repoPath: repo.repoPath,
          worktreePath,
          branch,
        });
      } catch (err) {
        // Roll back already-created worktrees
        for (const entry of created) {
          try {
            await this.removeWorktree(entry.repoPath, entry.worktreePath);
          } catch {
            // best-effort cleanup
          }
        }
        try {
          await fs.rm(sessionDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
        throw err;
      }
    }

    return { sessionDir, repos: created };
  }

  async createMultiRepoWorktreesFromBranch(
    repos: Array<{ repoId: string; repoPath: string; repoName: string }>,
    branchName: string,
    taskName: string,
    createBranch: boolean,
  ): Promise<MultiRepoWorktreeResult> {
    const shortId = crypto.randomUUID().slice(0, 8);
    const safeName = taskName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const sessionDir = path.join(this.worktreeBase, `${safeName}-${shortId}`);

    await fs.mkdir(sessionDir, { recursive: true });

    const created: MultiRepoWorktreeEntry[] = [];

    for (const repo of repos) {
      const safeRepoName = repo.repoName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const worktreePath = path.join(sessionDir, safeRepoName);

      try {
        if (createBranch) {
          await execFileAsync('git', ['worktree', 'add', worktreePath, '-b', branchName], {
            cwd: repo.repoPath,
          });
        } else {
          await execFileAsync('git', ['worktree', 'add', worktreePath, branchName], {
            cwd: repo.repoPath,
          });
        }
        created.push({
          repoId: repo.repoId,
          repoPath: repo.repoPath,
          worktreePath,
          branch: branchName,
        });
      } catch (err) {
        for (const entry of created) {
          try {
            await this.removeWorktree(entry.repoPath, entry.worktreePath);
          } catch {
            // best-effort cleanup
          }
        }
        try {
          await fs.rm(sessionDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
        throw err;
      }
    }

    return { sessionDir, repos: created };
  }

  async removeMultiRepoWorktrees(manifest: MultiRepoWorktreeEntry[]): Promise<void> {
    let sessionDir: string | null = null;

    for (const entry of manifest) {
      try {
        if (!sessionDir) {
          sessionDir = path.dirname(entry.worktreePath);
        }
        await this.removeWorktree(entry.repoPath, entry.worktreePath);
      } catch (err) {
        console.warn(`Failed to remove worktree ${entry.worktreePath}:`, err);
      }
    }

    // Remove parent session directory after all worktrees cleaned
    if (sessionDir) {
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }

  async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
    });

    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.dir) {
          worktrees.push(current as WorktreeInfo);
        }
        current = { dir: line.slice('worktree '.length) };
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice('branch refs/heads/'.length);
      } else if (line === '') {
        if (current.dir) {
          worktrees.push({
            dir: current.dir,
            branch: current.branch || 'HEAD',
          });
        }
        current = {};
      }
    }

    return worktrees;
  }
}
