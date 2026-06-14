import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TASKS_FILE = join(DATA_DIR, 'tasks.json');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

const REPO_COLORS = ['#3a7bd5', '#5e7ce6', '#7be58c', '#e5a73a', '#e57b7b', '#a07be5', '#7be5e5', '#e57bd5'];
const BEHAVIORS = ['queue', 'run', 'stop'];

const DEFAULT_COLUMNS = [
  { id: 'backlog', name: 'Backlog', behavior: 'queue' },
  { id: 'in-progress', name: 'In Progress', behavior: 'run' },
  { id: 'review', name: 'Review', behavior: 'stop' },
  { id: 'done', name: 'Done', behavior: 'stop' },
];

const DEFAULT_CONFIG = {
  repos: [],
  columns: DEFAULT_COLUMNS,
  maxConcurrent: 5,
  skillsByState: {},
};

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `col-${newId()}`;
}

function makeRepo({ path, name, baseBranch, worktreeDir, color }, index = 0) {
  return {
    id: newId(),
    name: name || basename(path) || 'repo',
    path,
    baseBranch: baseBranch || 'main',
    worktreeDir: worktreeDir || '.worktrees',
    color: color || REPO_COLORS[index % REPO_COLORS.length],
  };
}

async function readJSON(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return structuredClone(fallback); }
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

function migrateConfig(loaded) {
  const cfg = { ...DEFAULT_CONFIG, ...loaded };
  cfg.skillsByState = { ...(loaded.skillsByState || {}) };
  if (!Array.isArray(cfg.repos)) cfg.repos = [];
  if (cfg.repos.length === 0 && loaded.repoPath) {
    cfg.repos = [makeRepo({
      path: loaded.repoPath,
      baseBranch: loaded.baseBranch,
      worktreeDir: loaded.worktreeDir,
    })];
  }
  delete cfg.repoPath;
  delete cfg.baseBranch;
  delete cfg.worktreeDir;
  cfg.repos = cfg.repos.map((r, i) => ({
    id: r.id || newId(),
    name: r.name || basename(r.path) || `repo-${i + 1}`,
    path: r.path,
    baseBranch: r.baseBranch || 'main',
    worktreeDir: r.worktreeDir || '.worktrees',
    color: r.color || REPO_COLORS[i % REPO_COLORS.length],
  }));
  if (!Array.isArray(cfg.columns) || cfg.columns.length === 0) {
    cfg.columns = DEFAULT_COLUMNS.map(c => ({ ...c }));
  } else {
    cfg.columns = cfg.columns.map((c, i) => ({
      id: c.id || slugify(c.name) || `col-${i}`,
      name: c.name || DEFAULT_COLUMNS[i]?.name || `Column ${i + 1}`,
      behavior: BEHAVIORS.includes(c.behavior) ? c.behavior : 'queue',
    }));
  }
  return cfg;
}

export class Store {
  constructor() {
    this.tasks = [];
    this.config = structuredClone(DEFAULT_CONFIG);
    this.listeners = new Set();
  }

  async load() {
    this.tasks = await readJSON(TASKS_FILE, []);
    const loaded = await readJSON(CONFIG_FILE, DEFAULT_CONFIG);
    this.config = migrateConfig(loaded);
    let changed = false;
    const validStates = new Set(this.config.columns.map(c => c.id));
    const firstId = this.config.columns[0]?.id || 'backlog';
    for (const t of this.tasks) {
      if (!t.repoId && this.config.repos[0]) {
        t.repoId = this.config.repos[0].id;
        changed = true;
      }
      if (!validStates.has(t.state)) {
        t.state = firstId;
        changed = true;
      }
    }
    if (changed) await this.saveTasks();
    await this.saveConfig();
  }

  async saveTasks() { await writeJSON(TASKS_FILE, this.tasks); }
  async saveConfig() { await writeJSON(CONFIG_FILE, this.config); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(event) { for (const fn of this.listeners) fn(event); }

  getTasks() { return this.tasks; }
  getTask(id) { return this.tasks.find(t => t.id === id); }
  getRepo(id) { return this.config.repos.find(r => r.id === id); }
  getColumn(id) { return this.config.columns.find(c => c.id === id); }

  async addTask({ title, prompt, repoId, state }) {
    if (!repoId) throw new Error('repoId required');
    if (!this.getRepo(repoId)) throw new Error('unknown repoId');
    const targetState = state || this.config.columns[0]?.id;
    if (!targetState || !this.getColumn(targetState)) throw new Error('unknown column');
    const task = {
      id: newId(),
      title: title || prompt.slice(0, 60),
      prompt,
      state: targetState,
      repoId,
      branch: null,
      worktreePath: null,
      createdAt: new Date().toISOString(),
      logPath: null,
      pid: null,
      exitCode: null,
    };
    this.tasks.push(task);
    await this.saveTasks();
    this.emit({ type: 'task:add', task });
    return task;
  }

  async updateTask(id, patch) {
    const t = this.getTask(id);
    if (!t) return null;
    Object.assign(t, patch);
    await this.saveTasks();
    this.emit({ type: 'task:update', task: t });
    return t;
  }

  async deleteTask(id) {
    const i = this.tasks.findIndex(t => t.id === id);
    if (i < 0) return false;
    const [removed] = this.tasks.splice(i, 1);
    await this.saveTasks();
    this.emit({ type: 'task:delete', task: removed });
    return true;
  }

  async setConfig(patch) {
    this.config = migrateConfig({ ...this.config, ...patch, skillsByState: { ...this.config.skillsByState, ...(patch.skillsByState || {}) } });
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return this.config;
  }

  async addRepo(input) {
    if (!input?.path) throw new Error('path required');
    if (this.config.repos.find(r => r.path === input.path)) throw new Error('repo already added');
    const repo = makeRepo(input, this.config.repos.length);
    this.config.repos.push(repo);
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return repo;
  }

  async updateRepo(id, patch) {
    const repo = this.getRepo(id);
    if (!repo) return null;
    Object.assign(repo, patch);
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return repo;
  }

  async removeRepo(id) {
    const i = this.config.repos.findIndex(r => r.id === id);
    if (i < 0) return false;
    this.config.repos.splice(i, 1);
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return true;
  }

  async addColumn({ name, behavior }) {
    const cleanName = (name || '').trim() || `Column ${this.config.columns.length + 1}`;
    let id = slugify(cleanName);
    let suffix = 2;
    while (this.config.columns.find(c => c.id === id)) {
      id = `${slugify(cleanName)}-${suffix++}`;
    }
    const col = {
      id,
      name: cleanName,
      behavior: BEHAVIORS.includes(behavior) ? behavior : 'queue',
    };
    this.config.columns.push(col);
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return col;
  }

  async updateColumn(id, patch) {
    const col = this.getColumn(id);
    if (!col) return null;
    if (patch.name) col.name = String(patch.name);
    if (patch.behavior && BEHAVIORS.includes(patch.behavior)) col.behavior = patch.behavior;
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return col;
  }

  async removeColumn(id) {
    if (this.config.columns.length <= 1) throw new Error('cannot remove last column');
    const tasksHere = this.tasks.filter(t => t.state === id);
    if (tasksHere.length) throw new Error(`column has ${tasksHere.length} task(s); move them first`);
    const i = this.config.columns.findIndex(c => c.id === id);
    if (i < 0) return false;
    this.config.columns.splice(i, 1);
    if (this.config.skillsByState[id]) delete this.config.skillsByState[id];
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return true;
  }

  async reorderColumns(orderedIds) {
    const map = new Map(this.config.columns.map(c => [c.id, c]));
    const reordered = orderedIds.map(id => map.get(id)).filter(Boolean);
    if (reordered.length !== this.config.columns.length) throw new Error('order must contain all columns');
    this.config.columns = reordered;
    await this.saveConfig();
    this.emit({ type: 'config', config: this.config });
    return this.config.columns;
  }
}
