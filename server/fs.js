import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';

async function isDirSafe(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

export async function listDir(path) {
  const abs = resolve(path || homedir());
  const entries = await readdir(abs, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue;
    const full = join(abs, e.name);
    const isDir = e.isDirectory() || (e.isSymbolicLink() && await isDirSafe(full));
    if (!isDir) continue;
    dirs.push({
      name: e.name,
      path: full,
      isSymlink: e.isSymbolicLink(),
      isGitRepo: existsSync(join(full, '.git')),
      hasSkillMd: existsSync(join(full, 'SKILL.md')),
    });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const parent = dirname(abs);
  return {
    path: abs,
    parent: parent === abs ? null : parent,
    isGitRepo: existsSync(join(abs, '.git')),
    hasSkillMd: existsSync(join(abs, 'SKILL.md')),
    name: basename(abs),
    entries: dirs,
  };
}

export async function listSkills() {
  const base = join(homedir(), '.claude', 'skills');
  if (!existsSync(base)) return [];
  const entries = await readdir(base, { withFileTypes: true });
  const skills = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    skills.push({ name: e.name, source: 'user', path: null });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
