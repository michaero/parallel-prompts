import { spawn } from 'node:child_process';
import { join, isAbsolute } from 'node:path';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d);
    p.stderr.on('data', d => stderr += d);
    p.on('error', reject);
    p.on('close', code => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr}`)));
  });
}

function resolveWorktreePath(repo, taskId) {
  const sub = `${repo.worktreeDir || '.worktrees'}/task-${taskId}`;
  return isAbsolute(sub) ? sub : join(repo.path, sub);
}

export async function createWorktree(repo, task) {
  if (!repo?.path) throw new Error('repo.path is not set');
  const path = resolveWorktreePath(repo, task.id);
  const branch = `agent/task-${task.id}`;
  await run('git', ['worktree', 'add', '-b', branch, path, repo.baseBranch || 'main'], {
    cwd: repo.path,
  });
  return { path, branch };
}

export async function removeWorktree(repo, task) {
  if (!task.worktreePath || !repo) return;
  try {
    await run('git', ['worktree', 'remove', '--force', task.worktreePath], { cwd: repo.path });
  } catch (e) {
    console.error('worktree remove failed:', e.message);
  }
}

export async function getDiff(task) {
  if (!task.worktreePath) return '';
  try {
    const { stdout } = await run('git', ['diff', 'HEAD'], { cwd: task.worktreePath });
    return stdout;
  } catch {
    return '';
  }
}
