import { spawn } from 'node:child_process';

function exec(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => resolve({ code: -1, out, err: e.message }));
    p.on('close', code => resolve({ code: code ?? -1, out, err }));
  });
}

export function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function sessionName(taskId) {
  return `pp-${taskId}`;
}

export async function hasSession(name) {
  const r = await exec('tmux', ['has-session', '-t', name]);
  return r.code === 0;
}

export async function killSession(name) {
  await exec('tmux', ['kill-session', '-t', name]);
}

export async function listSessions() {
  const r = await exec('tmux', ['list-sessions', '-F', '#{session_name}']);
  if (r.code !== 0) return [];
  return r.out.split('\n').filter(Boolean);
}

export async function newSessionWithCommand(name, cwd, command) {
  const r = await exec('tmux', [
    'new-session', '-d', '-s', name, '-x', '160', '-y', '40', '-c', cwd,
    'bash', '-lc', command,
  ]);
  if (r.code !== 0) throw new Error(`tmux new-session failed: ${r.err || r.out}`);
}

export async function pipePane(name, logPath) {
  await exec('tmux', ['pipe-pane', '-t', `${name}:0.0`, `cat >> ${shellEscape(logPath)}`]);
}

export async function sendText(name, text) {
  // -l: literal, no key-name interpretation
  await exec('tmux', ['send-keys', '-t', `${name}:0.0`, '-l', text]);
}

export async function sendEnter(name) {
  await exec('tmux', ['send-keys', '-t', `${name}:0.0`, 'Enter']);
}

export async function sendLine(name, text) {
  await sendText(name, text);
  await sendEnter(name);
}
