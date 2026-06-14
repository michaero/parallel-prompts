#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const distIndex = join(projectRoot, 'web', 'dist', 'index.html');

const args = new Set(process.argv.slice(2));
const NO_OPEN = args.has('--no-open');
const FORCE_BUILD = args.has('--build');

if (FORCE_BUILD || !existsSync(distIndex)) {
  console.log(FORCE_BUILD ? 'Rebuilding UI…' : 'No build found. Building UI…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: projectRoot, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || '127.0.0.1';
const url = `http://${HOST}:${PORT}/`;

const server = spawn('node', ['server/index.js'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT), HOST },
});

server.on('exit', code => process.exit(code ?? 0));

if (!NO_OPEN) {
  // Give the server a beat to bind, then open the browser
  setTimeout(() => {
    const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  }, 700);
}

process.on('SIGINT', () => { server.kill('SIGTERM'); });
process.on('SIGTERM', () => { server.kill('SIGTERM'); });
