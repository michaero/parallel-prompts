import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, openSync, closeSync, symlinkSync, lstatSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorktree, removeWorktree } from './worktree.js';
import * as tmux from './tmux.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'data', 'logs');

function normalizeSkill(value) {
  if (!value) return null;
  if (typeof value === 'string') return { name: value, path: null };
  if (value.name) return { name: value.name, path: value.path || null };
  return null;
}

function lstatExists(path) {
  try { lstatSync(path); return true; } catch { return false; }
}

function linkExternalSkill(worktreePath, skill) {
  if (!skill?.path) return;
  const skillsDir = join(worktreePath, '.claude', 'skills');
  mkdirSync(skillsDir, { recursive: true });
  const target = join(skillsDir, skill.name);
  if (lstatExists(target)) {
    try { unlinkSync(target); } catch {}
  }
  symlinkSync(skill.path, target, 'dir');
}

function startTail(logPath, onChunk) {
  const proc = spawn('tail', ['-F', '-n', '+1', logPath], { stdio: ['ignore', 'pipe', 'ignore'] });
  proc.stdout.on('data', d => onChunk(d.toString('utf8')));
  return proc;
}

export class Worker {
  constructor(store) {
    this.store = store;
    this.running = new Map(); // taskId -> { tailProc, sessionName }
    this.heartbeat = setInterval(() => this.tick(), 2000);
  }

  capacity() { return this.store.config.maxConcurrent - this.running.size; }
  isRunning(id) { return this.running.has(id); }

  async tick() {
    for (const taskId of [...this.running.keys()]) {
      const name = this.running.get(taskId)?.sessionName;
      if (!name) continue;
      const alive = await tmux.hasSession(name);
      if (!alive) await this.handleExit(taskId);
    }
  }

  async reconcile() {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    for (const task of this.store.getTasks()) {
      if (task.state !== 'in-progress') continue;
      const name = tmux.sessionName(task.id);
      const alive = await tmux.hasSession(name);
      if (alive && task.logPath) {
        await tmux.pipePane(name, task.logPath);
        const tailProc = startTail(task.logPath, chunk => {
          this.store.emit({ type: 'log', taskId: task.id, chunk });
        });
        this.running.set(task.id, { tailProc, sessionName: name });
      } else {
        await this.store.updateTask(task.id, { state: 'review', tmuxSession: null });
      }
    }
  }

  async start(task) {
    if (this.running.has(task.id)) return;
    if (this.capacity() <= 0) throw new Error('At capacity');

    const repo = this.store.getRepo(task.repoId);
    if (!repo) throw new Error(`task ${task.id} has no valid repo`);

    let { worktreePath, branch } = task;
    if (!worktreePath) {
      const wt = await createWorktree(repo, task);
      worktreePath = wt.path;
      branch = wt.branch;
    }

    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const logPath = join(LOG_DIR, `${task.id}.log`);
    closeSync(openSync(logPath, 'w')); // truncate

    const skill = normalizeSkill(this.store.config.skillsByState?.[task.state]);
    if (skill?.path) {
      try { linkExternalSkill(worktreePath, skill); } catch (e) {
        console.error('skill link failed:', e.message);
      }
    }
    const fullPrompt = skill ? `/${skill.name} ${task.prompt}` : task.prompt;

    const name = tmux.sessionName(task.id);
    await tmux.killSession(name); // ensure clean

    const claudeCmd = `claude --dangerously-skip-permissions ${tmux.shellEscape(fullPrompt)}`;
    await tmux.newSessionWithCommand(name, worktreePath, claudeCmd);
    await tmux.pipePane(name, logPath);

    const tailProc = startTail(logPath, chunk => {
      this.store.emit({ type: 'log', taskId: task.id, chunk });
    });

    this.running.set(task.id, { tailProc, sessionName: name });
    await this.store.updateTask(task.id, {
      worktreePath,
      branch,
      logPath,
      tmuxSession: name,
      pid: null,
      exitCode: null,
    });
  }

  async handleExit(taskId) {
    const entry = this.running.get(taskId);
    if (!entry) return;
    entry.tailProc?.kill();
    this.running.delete(taskId);
    await this.store.updateTask(taskId, { state: 'review', tmuxSession: null });
  }

  async stop(taskId) {
    const entry = this.running.get(taskId);
    if (!entry) return false;
    await tmux.killSession(entry.sessionName);
    await this.handleExit(taskId);
    return true;
  }

  async sendInput(taskId, text) {
    const entry = this.running.get(taskId);
    if (!entry) throw new Error('not running');
    await tmux.sendLine(entry.sessionName, text);
  }

  async sendKey(taskId, key) {
    const entry = this.running.get(taskId);
    if (!entry) throw new Error('not running');
    const { spawn } = await import('node:child_process');
    spawn('tmux', ['send-keys', '-t', `${entry.sessionName}:0.0`, key]);
  }

  readLog(task, maxBytes = 2_000_000) {
    if (!task.logPath || !existsSync(task.logPath)) return '';
    const buf = readFileSync(task.logPath);
    if (buf.length <= maxBytes) return buf.toString('utf8');
    return buf.slice(buf.length - maxBytes).toString('utf8');
  }

  async cleanup(task) {
    await this.stop(task.id);
    const repo = this.store.getRepo(task.repoId);
    if (repo) await removeWorktree(repo, task);
  }
}
