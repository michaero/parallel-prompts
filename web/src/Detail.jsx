import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api } from './api.js';
import { btn } from './theme.js';

const TERM_COLS = 160;
const TERM_ROWS = 40;

export function Detail({ task, repo, subscribe, onClose }) {
  const [tab, setTab] = useState('terminal');
  const [diff, setDiff] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const termContainer = useRef(null);
  const termRef = useRef(null);
  const isRunning = task.state === 'in-progress';

  useEffect(() => {
    if (tab === 'diff') api.diff(task.id).then(setDiff);
  }, [tab, task.id, task.state]);

  // Mount xterm once per task. Subscribe before fetching log; buffer incoming chunks until log is written.
  useEffect(() => {
    if (tab !== 'terminal' || !termContainer.current) return;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const term = new Terminal({
      convertEol: true,
      cols: TERM_COLS,
      rows: TERM_ROWS,
      scrollback: 5000,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 12,
      theme: isDark
        ? { background: '#0a0c10', foreground: '#e6e6e6', cursor: '#3a7bd5' }
        : { background: '#f8f9fb', foreground: '#1a1d24', cursor: '#2c6ad0' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termContainer.current);
    try { fit.fit(); } catch {}
    termRef.current = term;

    let buffered = '';
    let logLoaded = false;
    const unsubscribe = subscribe(task.id, (chunk) => {
      if (logLoaded) term.write(chunk);
      else buffered += chunk;
    });

    api.log(task.id).then((text) => {
      term.write(text);
      if (buffered) {
        // Best-effort overlap removal: drop the prefix of `buffered` that matches the tail of `text`.
        const overlap = Math.min(buffered.length, text.length);
        let cut = 0;
        for (let n = overlap; n > 0; n--) {
          if (text.endsWith(buffered.slice(0, n))) { cut = n; break; }
        }
        term.write(buffered.slice(cut));
      }
      logLoaded = true;
      buffered = '';
    });

    const onResize = () => { try { fit.fit(); } catch {} };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      unsubscribe();
      term.dispose();
      termRef.current = null;
    };
  }, [task.id, tab, subscribe]);

  async function send() {
    if (!input.trim() || !isRunning) return;
    setSending(true);
    try {
      await api.sendInput(task.id, input);
      setInput('');
    } catch (e) {
      alert('send failed: ' + e.message);
    } finally {
      setSending(false);
    }
  }

  async function sendKey(key) {
    try { await api.sendKey(task.id, key); }
    catch (e) { alert('send failed: ' + e.message); }
  }

  async function del() {
    if (!confirm('Delete task and remove its worktree?')) return;
    await api.deleteTask(task.id);
    onClose();
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{task.title}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{task.state}</span>
          {isRunning && <span style={{ fontSize: 11, color: 'var(--success)' }}>● live</span>}
          <div style={{ flex: 1 }} />
          <button onClick={del} style={btn('danger')}>delete</button>
          <button onClick={onClose} style={btn()}>close</button>
        </header>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          {repo && (
            <span style={{ marginRight: 12 }}>
              repo: <span style={{ color: repo.color }}>●</span> <code>{repo.name}</code>
            </span>
          )}
          {task.branch && <span style={{ marginRight: 12 }}>branch: <code>{task.branch}</code></span>}
          {task.tmuxSession && <span style={{ marginRight: 12 }}>tmux: <code>{task.tmuxSession}</code></span>}
        </div>
        <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap', maxHeight: 80, overflowY: 'auto' }}>
          {task.prompt}
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {['terminal', 'diff'].map(k => (
            <button key={k} onClick={() => setTab(k)} style={btn(tab === k ? 'primary' : 'default')}>{k}</button>
          ))}
        </div>

        {tab === 'terminal' ? (
          <>
            <div
              ref={termContainer}
              style={{ flex: 1, minHeight: 0, background: 'var(--code-bg)', borderRadius: 6, padding: 6, overflow: 'hidden' }}
            />
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              style={{ display: 'flex', gap: 6, marginTop: 8 }}
            >
              <input
                placeholder={isRunning ? 'send message to running session…' : '(not running — drag to In Progress to start)'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!isRunning || sending}
                style={{ flex: 1, fontFamily: 'ui-monospace, monospace' }}
              />
              <button type="submit" disabled={!isRunning || sending || !input.trim()} style={btn('primary')}>send ⏎</button>
              <button type="button" onClick={() => sendKey('Enter')} disabled={!isRunning} style={btn()} title="Enter">⏎</button>
              <button type="button" onClick={() => sendKey('Escape')} disabled={!isRunning} style={btn()} title="Esc">Esc</button>
              <button type="button" onClick={() => sendKey('C-c')} disabled={!isRunning} style={btn('danger')} title="Ctrl-C">^C</button>
            </form>
          </>
        ) : (
          <pre style={{ background: 'var(--code-bg)', padding: 12, borderRadius: 6, flex: 1, overflow: 'auto', margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {diff || '(no diff)'}
          </pre>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'var(--overlay)',
  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100,
};
const panel = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 16,
  width: 'min(1100px, 95vw)',
  height: 'min(800px, 90vh)',
  display: 'flex',
  flexDirection: 'column',
};
