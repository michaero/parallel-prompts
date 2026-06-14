import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Worker } from './worker.js';
import { getDiff } from './worktree.js';
import { listDir, listSkills } from './fs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || '127.0.0.1';

function checkOnPath(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
}
for (const tool of ['tmux', 'claude', 'git']) {
  if (!checkOnPath(tool)) {
    console.warn(`[warn] '${tool}' not found on PATH — required at runtime`);
  }
}

const store = new Store();
await store.load();
const worker = new Worker(store);
await worker.reconcile();

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (_req, res) => res.json(store.config));
app.put('/api/config', async (req, res) => {
  const updated = await store.setConfig(req.body || {});
  res.json(updated);
});

app.post('/api/repos', async (req, res) => {
  try { res.json(await store.addRepo(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/repos/:id', async (req, res) => {
  const repo = await store.updateRepo(req.params.id, req.body || {});
  if (!repo) return res.status(404).json({ error: 'not found' });
  res.json(repo);
});
app.delete('/api/repos/:id', async (req, res) => {
  const ok = await store.removeRepo(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.post('/api/columns', async (req, res) => {
  try { res.json(await store.addColumn(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/columns/:id', async (req, res) => {
  const col = await store.updateColumn(req.params.id, req.body || {});
  if (!col) return res.status(404).json({ error: 'not found' });
  res.json(col);
});
app.delete('/api/columns/:id', async (req, res) => {
  try {
    const ok = await store.removeColumn(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.put('/api/columns/order', async (req, res) => {
  try { res.json(await store.reorderColumns(req.body?.ids || [])); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/tasks', (_req, res) => res.json(store.getTasks()));

app.post('/api/tasks', async (req, res) => {
  const { title, prompt, repoId, state } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });
  const targetRepoId = repoId || store.config.repos[0]?.id;
  if (!targetRepoId) return res.status(400).json({ error: 'no repo configured' });
  try {
    const task = await store.addTask({ title, prompt, repoId: targetRepoId, state });
    const col = store.getColumn(task.state);
    if (col?.behavior === 'run') {
      if (worker.capacity() <= 0) {
        // Created but can't auto-start; leave in the column, surface via WS state update
      } else {
        try { await worker.start(task); } catch (e) { console.error('auto-start failed:', e.message); }
      }
    }
    res.json(store.getTask(task.id) || task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  const id = req.params.id;
  const task = store.getTask(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const { state, prompt, title } = req.body || {};

  const patch = {};
  if (typeof prompt === 'string') patch.prompt = prompt;
  if (typeof title === 'string') patch.title = title;
  if (Object.keys(patch).length) await store.updateTask(id, patch);

  if (state && state !== task.state) {
    const col = store.getColumn(state);
    if (!col) return res.status(400).json({ error: 'unknown column' });

    if (col.behavior === 'run') {
      if (worker.isRunning(id)) {
        await store.updateTask(id, { state });
      } else {
        if (worker.capacity() <= 0) return res.status(429).json({ error: 'at capacity' });
        await store.updateTask(id, { state });
        try {
          await worker.start(store.getTask(id));
        } catch (e) {
          await store.updateTask(id, { state: task.state });
          return res.status(500).json({ error: e.message });
        }
      }
    } else {
      if (worker.isRunning(id)) await worker.stop(id);
      await store.updateTask(id, { state });
    }
  }
  res.json(store.getTask(id));
});

app.delete('/api/tasks/:id', async (req, res) => {
  const id = req.params.id;
  const task = store.getTask(id);
  if (!task) return res.status(404).json({ error: 'not found' });
  await worker.cleanup(task);
  await store.deleteTask(id);
  res.json({ ok: true });
});

app.get('/api/tasks/:id/log', (req, res) => {
  const task = store.getTask(req.params.id);
  if (!task) return res.status(404).end();
  res.type('text/plain').send(worker.readLog(task));
});

app.post('/api/tasks/:id/input', async (req, res) => {
  const task = store.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const { text, key } = req.body || {};
  try {
    if (key) await worker.sendKey(task.id, key);
    else if (typeof text === 'string') await worker.sendInput(task.id, text);
    else return res.status(400).json({ error: 'text or key required' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/tasks/:id/diff', async (req, res) => {
  const task = store.getTask(req.params.id);
  if (!task) return res.status(404).end();
  res.type('text/plain').send(await getDiff(task));
});

app.get('/api/browse', async (req, res) => {
  try { res.json(await listDir(req.query.path)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/skills', async (_req, res) => {
  res.json(await listSkills());
});

const distDir = join(__dirname, '..', 'web', 'dist');
if (existsSync(join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(join(distDir, 'index.html')));
  console.log(`serving built UI from ${distDir}`);
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', tasks: store.getTasks(), config: store.config }));
  const off = store.onChange((event) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  });
  ws.on('close', off);
});

server.listen(PORT, HOST, () => {
  console.log(`parallel-prompts server on http://${HOST}:${PORT}`);
});
