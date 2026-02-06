import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as crypto from 'crypto';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
  dir: string;
  branch: string;
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
