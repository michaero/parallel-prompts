#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const distIndex = join(projectRoot, 'web', 'dist', 'index.html');

const args = new Set(process.argv.slice(2));
const NO_OPEN = args.has('--no-open');
const FORCE_BUILD = args.has('--build');

const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || '127.0.0.1';
const url = `http://${HOST}:${PORT}/`;

function notify(msg, title = 'Parallel Prompts') {
  if (platform() !== 'darwin') return;
  spawn('osascript', ['-e', `display notification "${msg.replace(/"/g, '\\"')}" with title "${title}"`], { stdio: 'ignore' }).on('error', () => {});
}

function openBrowser() {
  if (NO_OPEN) return;
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
}

function probeRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${url}api/config`, { timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const alreadyRunning = await probeRunning();
if (alreadyRunning) {
  console.log(`parallel-prompts already running at ${url} — opening browser.`);
  openBrowser();
  process.exit(0);
}

if (FORCE_BUILD || !existsSync(distIndex)) {
  console.log(FORCE_BUILD ? 'Rebuilding UI…' : 'No build found. Building UI…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: projectRoot, stdio: 'inherit' });
  if (r.status !== 0) {
    notify('UI build failed — see launcher.log');
    process.exit(r.status || 1);
  }
}

const server = spawn('node', ['server/index.js'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT), HOST },
});

let serverReady = false;
server.on('exit', (code) => {
  if (!serverReady) {
    notify(`Server exited (code ${code}) — see launcher.log`);
  }
  process.exit(code ?? 0);
});

// Poll until the server answers, then open the browser. Up to 10s.
const deadline = Date.now() + 10_000;
const waitInterval = setInterval(async () => {
  if (await probeRunning()) {
    clearInterval(waitInterval);
    serverReady = true;
    openBrowser();
  } else if (Date.now() > deadline) {
    clearInterval(waitInterval);
    notify('Server did not become ready in 10s');
  }
}, 300);

process.on('SIGINT', () => { server.kill('SIGTERM'); });
process.on('SIGTERM', () => { server.kill('SIGTERM'); });
