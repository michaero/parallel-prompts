import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { btn } from './theme.js';
import { FolderPicker } from './FolderPicker.jsx';

const BEHAVIORS = [
  { value: 'queue', label: 'queue (just hold tasks)' },
  { value: 'run', label: 'run (spawn claude on entry)' },
  { value: 'stop', label: 'stop (kill claude on entry)' },
];

function normalizeSkill(v) {
  if (!v) return null;
  if (typeof v === 'string') return { name: v, path: null };
  return v;
}

export function ConfigBar({ config, theme, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(config);
  const [picker, setPicker] = useState(null);
  const [skills, setSkills] = useState([]);

  useEffect(() => { setDraft(config); }, [config]);
  useEffect(() => { if (open) api.skills().then(setSkills); }, [open]);
  if (!config) return null;

  async function saveGlobals() {
    await api.setConfig({
      maxConcurrent: draft.maxConcurrent,
      skillsByState: draft.skillsByState,
    });
    setOpen(false);
  }

  function setSkillForState(state, value) {
    setDraft(d => ({
      ...d,
      skillsByState: { ...d.skillsByState, [state]: value },
    }));
  }

  async function addRepo(path) {
    try { await api.addRepo({ path }); }
    catch (e) { alert('Could not add repo: ' + e.message); }
  }
  async function patchRepo(id, patch) { await api.updateRepo(id, patch); }
  async function removeRepo(id) {
    if (!confirm('Remove this repo?')) return;
    await api.removeRepo(id);
  }

  async function addColumn() {
    const name = prompt('Column name:');
    if (!name) return;
    try { await api.addColumn({ name, behavior: 'queue' }); }
    catch (e) { alert(e.message); }
  }
  async function patchColumn(id, patch) {
    try { await api.updateColumn(id, patch); }
    catch (e) { alert(e.message); }
  }
  async function removeColumn(id) {
    if (!confirm('Remove this column?')) return;
    try { await api.removeColumn(id); }
    catch (e) { alert(e.message); }
  }

  const summary = config.repos.length === 0
    ? <em style={{ color: 'var(--warn)' }}>no repos configured</em>
    : `${config.repos.length} repo${config.repos.length === 1 ? '' : 's'} · ${config.columns.length} columns`;

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <strong>parallel-prompts</strong>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{summary}</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={onToggleTheme}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        style={btn()}
        aria-label="toggle theme"
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>
      <button onClick={() => setOpen(v => !v)} style={btn()}>{open ? 'close' : 'settings'}</button>

      {open && draft && (
        <div style={panel}>
          <h3 style={{ margin: '0 0 12px' }}>Repositories</h3>
          {draft.repos.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>(no repos yet — add one to start)</div>
          )}
          {draft.repos.map(r => (
            <RepoRow key={r.id} repo={r} onPatch={p => patchRepo(r.id, p)} onRemove={() => removeRepo(r.id)} />
          ))}
          <button onClick={() => setPicker('add-repo')} style={{ ...btn(), marginTop: 4 }}>+ add repository</button>

          <h4 style={{ margin: '20px 0 8px' }}>Columns</h4>
          {draft.columns.map(c => (
            <ColumnRow key={c.id} column={c} onPatch={p => patchColumn(c.id, p)} onRemove={() => removeColumn(c.id)} />
          ))}
          <button onClick={addColumn} style={{ ...btn(), marginTop: 4 }}>+ add column</button>

          <h4 style={{ margin: '20px 0 8px' }}>Global</h4>
          <Row label="Max concurrent">
            <input type="number" min={1} max={20} value={draft.maxConcurrent} onChange={e => setDraft({ ...draft, maxConcurrent: Number(e.target.value) })} style={{ width: 80 }} />
          </Row>

          <h4 style={{ margin: '16px 0 8px' }}>Skill per column</h4>
          {draft.columns.map(c => {
            const value = normalizeSkill(draft.skillsByState?.[c.id]);
            const isExternal = value?.path;
            const isUnknown = value && !value.path && !skills.find(sk => sk.name === value.name);
            const usable = c.behavior === 'run';
            return (
              <Row key={c.id} label={c.name}>
                <select
                  value={value && !isExternal ? value.name : (isExternal ? '__external__' : '')}
                  onChange={e => {
                    const v = e.target.value;
                    if (!v) setSkillForState(c.id, null);
                    else if (v === '__external__') {}
                    else setSkillForState(c.id, { name: v, path: null });
                  }}
                  style={{ flex: 1, opacity: usable ? 1 : 0.55 }}
                  title={usable ? '' : 'only "run" columns spawn claude — skill here is stored but unused'}
                >
                  <option value="">(none)</option>
                  {skills.map(sk => (
                    <option key={sk.name} value={sk.name}>{sk.name}</option>
                  ))}
                  {isExternal && (
                    <option value="__external__">{value.name} (external)</option>
                  )}
                  {isUnknown && (
                    <option value={value.name}>{value.name} (not installed)</option>
                  )}
                </select>
                <button onClick={() => setPicker(c.id)} style={btn()} title="browse for skill folder">📁</button>
                {value && (
                  <button onClick={() => setSkillForState(c.id, null)} style={btn()} title="clear">✕</button>
                )}
              </Row>
            );
          })}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Loaded {skills.length} skill{skills.length === 1 ? '' : 's'} from ~/.claude/skills/. Only "run" columns trigger skills.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setOpen(false)} style={btn()}>cancel</button>
            <button onClick={saveGlobals} style={btn('primary')}>save globals</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Repo/column edits save instantly. Globals (skills, concurrency) save on click.
          </div>
        </div>
      )}

      {picker === 'add-repo' && (
        <FolderPicker
          mode="folder"
          onClose={() => setPicker(null)}
          onSelect={(path) => { addRepo(path); setPicker(null); }}
        />
      )}
      {picker && picker !== 'add-repo' && (
        <FolderPicker
          mode="skill"
          initialPath={normalizeSkill(draft.skillsByState?.[picker])?.path || undefined}
          onClose={() => setPicker(null)}
          onSelect={(skill) => { setSkillForState(picker, skill); setPicker(null); }}
        />
      )}
    </div>
  );
}

function ColumnRow({ column, onPatch, onRemove }) {
  const [name, setName] = useState(column.name);
  useEffect(() => { setName(column.name); }, [column.id]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: 6, border: '1px solid var(--border-soft)', borderRadius: 6 }}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={() => name !== column.name && onPatch({ name })}
        placeholder="name"
        style={{ flex: 1 }}
      />
      <select
        value={column.behavior}
        onChange={e => onPatch({ behavior: e.target.value })}
        style={{ width: 220 }}
      >
        {BEHAVIORS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
      </select>
      <code style={{ fontSize: 10, color: 'var(--text-faint)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.id}</code>
      <button onClick={onRemove} style={btn('danger')} title="remove">✕</button>
    </div>
  );
}

function RepoRow({ repo, onPatch, onRemove }) {
  const [name, setName] = useState(repo.name);
  const [baseBranch, setBranch] = useState(repo.baseBranch);
  useEffect(() => { setName(repo.name); setBranch(repo.baseBranch); }, [repo.id]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: 6, border: '1px solid var(--border-soft)', borderRadius: 6 }}>
      <input
        type="color"
        value={repo.color}
        onChange={e => onPatch({ color: e.target.value })}
        style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
        title="card color"
      />
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={() => name !== repo.name && onPatch({ name })}
        placeholder="name"
        style={{ width: 110 }}
      />
      <input
        readOnly
        value={repo.path}
        title={repo.path}
        style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
      />
      <input
        value={baseBranch}
        onChange={e => setBranch(e.target.value)}
        onBlur={() => baseBranch !== repo.baseBranch && onPatch({ baseBranch })}
        placeholder="branch"
        style={{ width: 90 }}
      />
      <button onClick={onRemove} style={btn('danger')} title="remove">✕</button>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: 110, color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>{label}</span>
      {children}
    </label>
  );
}

const panel = {
  position: 'absolute',
  top: 60,
  right: 16,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 16,
  width: 680,
  maxHeight: 'calc(100vh - 80px)',
  overflowY: 'auto',
  zIndex: 50,
  boxShadow: 'var(--shadow)',
};
