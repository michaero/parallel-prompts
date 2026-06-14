import React, { useEffect, useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { btn } from './theme.js';

const BEHAVIOR_BADGES = {
  run: { label: 'spawn', color: 'var(--success)' },
  stop: { label: 'kill', color: 'var(--warn)' },
  queue: null,
};

export function Column({ column, tasks, onOpen, onAdd, skill, repos, repoById }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const badge = BEHAVIOR_BADGES[column.behavior];

  return (
    <div
      ref={setNodeRef}
      style={{
        background: 'var(--surface-2)',
        borderRadius: 10,
        padding: 10,
        outline: isOver ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {column.name}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {tasks.length}</span>
          {badge && (
            <span title={`tasks entering this column ${column.behavior === 'run' ? 'start claude' : 'stop claude'}`}
              style={{ fontSize: 10, color: badge.color, border: `1px solid ${badge.color}`, padding: '0 4px', borderRadius: 3 }}>
              {badge.label}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {skill && (
            <code
              title={typeof skill === 'object' && skill.path ? `external: ${skill.path}` : 'installed skill'}
              style={{ fontSize: 11, color: 'var(--skill)', background: 'var(--skill-bg)', padding: '2px 6px', borderRadius: 4 }}
            >
              /{typeof skill === 'string' ? skill : skill.name}{typeof skill === 'object' && skill.path ? ' ↗' : ''}
            </code>
          )}
          <button
            onClick={() => setAdding(v => !v)}
            style={{ ...btn(), padding: '2px 8px' }}
            title={`add task to ${column.name}`}
            disabled={repos.length === 0}
          >+</button>
        </div>
      </div>
      {adding && (
        <InlineNewTask
          repos={repos}
          onCancel={() => setAdding(false)}
          onSubmit={async (input) => {
            await onAdd({ ...input, state: column.id });
            setAdding(false);
          }}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {tasks.map(t => <Card key={t.id} task={t} repo={repoById?.[t.repoId]} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function InlineNewTask({ repos, onCancel, onSubmit }) {
  const [repoId, setRepoId] = useState(repos[0]?.id || '');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (!repoId && repos[0]) setRepoId(repos[0].id);
  }, [repos]);

  async function submit(e) {
    e.preventDefault();
    if (!prompt.trim() || !repoId) return;
    await onSubmit({ prompt, title: title.trim() || undefined, repoId });
  }

  return (
    <form
      onSubmit={submit}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {repos.length > 1 && (
        <select value={repoId} onChange={e => setRepoId(e.target.value)} style={{ fontSize: 12 }}>
          {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      <input
        placeholder="title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ fontSize: 12 }}
      />
      <textarea
        placeholder="prompt…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        autoFocus
        rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }}
        style={{ fontSize: 12 }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ ...btn(), fontSize: 12 }}>cancel</button>
        <button type="submit" disabled={!prompt.trim()} style={{ ...btn('primary'), fontSize: 12, opacity: prompt.trim() ? 1 : 0.5 }}>add</button>
      </div>
    </form>
  );
}

function Card({ task, repo, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const accent = repo?.color || 'var(--border)';
  const style = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${accent}`,
    borderRadius: 8,
    padding: 10,
    cursor: 'grab',
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
  };
  const running = task.tmuxSession;
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onDoubleClick={() => onOpen(task.id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
        <div style={{ fontWeight: 500, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        {repo && (
          <span style={{ fontSize: 10, color: accent, background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
            {repo.name}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {task.prompt}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: 'var(--text-faint)' }}>
        {task.branch && <span>{task.branch}</span>}
        {running && <span style={{ color: 'var(--success)' }}>● running</span>}
        <span style={{ flex: 1 }} />
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(task.id); }}
          style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 10 }}
        >
          open
        </button>
      </div>
    </div>
  );
}
