import React, { useState } from 'react';
import { api } from './api.js';
import { btn } from './theme.js';
import { FolderPicker } from './FolderPicker.jsx';

export function Welcome() {
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function add(path) {
    setBusy(true);
    setError(null);
    try { await api.addRepo({ path }); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); setPicker(false); }
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Welcome to parallel-prompts</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
          A kanban for running Claude on your repos in parallel git worktrees.
          Add a repository to get started — each task you create becomes its own
          isolated worktree with its own branch.
        </p>
        <button onClick={() => setPicker(true)} disabled={busy} style={{ ...btn('primary'), padding: '10px 18px', fontSize: 15 }}>
          {busy ? 'Adding…' : 'Add your first repository'}
        </button>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 12 }}>{error}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 28, lineHeight: 1.6 }}>
          You'll need <code>tmux</code>, <code>git</code>, and the{' '}
          <code>claude</code> CLI on your <code>PATH</code>.
        </div>
      </div>
      {picker && (
        <FolderPicker
          mode="folder"
          onClose={() => setPicker(false)}
          onSelect={add}
        />
      )}
    </div>
  );
}
