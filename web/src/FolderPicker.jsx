import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { btn } from './theme.js';

export function FolderPicker({ initialPath, onSelect, onClose, mode = 'folder' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load(path) {
    setError(null);
    try {
      setData(await api.browse(path));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(initialPath); }, [initialPath]);

  const isSkillMode = mode === 'skill';
  const canSelectCurrent = isSkillMode ? data?.hasSkillMd : !!data;
  const selectLabel = isSkillMode
    ? (data?.hasSkillMd ? `select skill "${data.name}"` : 'no SKILL.md here')
    : (data?.isGitRepo ? 'select this git repo' : 'select this folder');

  function select(path, isSkill) {
    if (isSkillMode) {
      if (!isSkill) return;
      onSelect({ name: pathBase(path), path });
    } else {
      onSelect(path);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{isSkillMode ? 'Select skill folder' : 'Select folder'}</h3>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={btn()}>cancel</button>
          <button
            disabled={!canSelectCurrent}
            onClick={() => data && select(data.path, data.hasSkillMd)}
            style={{ ...btn('primary'), opacity: canSelectCurrent ? 1 : 0.5 }}
          >
            {selectLabel}
          </button>
        </header>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            disabled={!data?.parent}
            onClick={() => data?.parent && load(data.parent)}
            style={{ ...btn(), opacity: data?.parent ? 1 : 0.4 }}
            title="parent"
          >↑</button>
          <input
            value={data?.path || ''}
            onChange={e => setData(d => d ? { ...d, path: e.target.value } : d)}
            onKeyDown={e => e.key === 'Enter' && load(e.currentTarget.value)}
            style={{ flex: 1, fontFamily: 'ui-monospace, monospace' }}
          />
          <button onClick={() => load(data?.path)} style={btn()}>go</button>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <div style={list}>
          {data?.entries.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 12 }}>(no subdirectories)</div>
          )}
          {data?.entries.map(e => {
            const selectable = isSkillMode ? e.hasSkillMd : true;
            return (
              <button
                key={e.path}
                onDoubleClick={() => selectable && select(e.path, e.hasSkillMd)}
                onClick={() => load(e.path)}
                style={{ ...row, opacity: isSkillMode && !selectable ? 0.7 : 1 }}
                title={e.path}
              >
                <span style={{ marginRight: 8 }}>{e.hasSkillMd ? '🎯' : e.isGitRepo ? '📦' : '📁'}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{e.name}{e.isSymlink && <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>↪</span>}</span>
                {e.hasSkillMd && <span style={{ fontSize: 10, color: 'var(--skill)' }}>skill</span>}
                {!e.hasSkillMd && e.isGitRepo && <span style={{ fontSize: 10, color: 'var(--skill)' }}>git</span>}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {isSkillMode
            ? 'click to drill in · 🎯 = folder with SKILL.md · double-click a 🎯 to select'
            : 'click to drill in · double-click to select · 📦 = git repo'}
        </div>
      </div>
    </div>
  );
}

function pathBase(p) {
  return p.split('/').filter(Boolean).pop() || p;
}

const overlay = {
  position: 'fixed', inset: 0, background: 'var(--overlay)',
  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200,
};
const panel = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 16,
  width: 'min(720px, 90vw)',
  height: 'min(560px, 80vh)',
  display: 'flex',
  flexDirection: 'column',
};
const list = {
  flex: 1,
  overflowY: 'auto',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 4,
};
const row = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  background: 'transparent',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 4,
  padding: '6px 8px',
  cursor: 'pointer',
  fontSize: 13,
};
