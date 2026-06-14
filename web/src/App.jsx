import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { api, connectWs } from './api.js';
import { Column } from './Column.jsx';
import { Detail } from './Detail.jsx';
import { ConfigBar } from './ConfigBar.jsx';
import { useTheme, btn } from './theme.js';
import { Welcome } from './Welcome.jsx';

export function App() {
  const [tasks, setTasks] = useState([]);
  const [config, setConfig] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState(null);
  const [repoFilter, setRepoFilter] = useState('all');
  const [theme, toggleTheme] = useTheme();
  const chunkListeners = useRef(new Map());

  useEffect(() => {
    api.listTasks().then(setTasks);
    api.getConfig().then(setConfig);
    return connectWs((ev) => {
      if (ev.type === 'hello') {
        setTasks(ev.tasks);
        setConfig(ev.config);
      } else if (ev.type === 'task:add') {
        setTasks((t) => [...t, ev.task]);
      } else if (ev.type === 'task:update') {
        setTasks((t) => t.map(x => x.id === ev.task.id ? ev.task : x));
      } else if (ev.type === 'task:delete') {
        setTasks((t) => t.filter(x => x.id !== ev.task.id));
      } else if (ev.type === 'config') {
        setConfig(ev.config);
      } else if (ev.type === 'log') {
        const set = chunkListeners.current.get(ev.taskId);
        if (set) for (const fn of set) fn(ev.chunk);
      }
    });
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const repoById = useMemo(() => {
    const m = {};
    for (const r of config?.repos || []) m[r.id] = r;
    return m;
  }, [config]);

  function subscribe(taskId, fn) {
    let set = chunkListeners.current.get(taskId);
    if (!set) { set = new Set(); chunkListeners.current.set(taskId, set); }
    set.add(fn);
    return () => set.delete(fn);
  }

  async function move(id, state) {
    try {
      await api.patchTask(id, { state });
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  function onDragEnd(e) {
    const id = e.active?.id;
    const over = e.over?.id;
    if (!id || !over) return;
    const columns = config?.columns || [];
    const target = columns.find(c => c.id === over)
      ? over
      : tasks.find(t => t.id === over)?.state;
    if (!target) return;
    const t = tasks.find(x => x.id === id);
    if (t && t.state !== target) move(id, target);
  }

  async function addTaskInColumn({ state, repoId, prompt, title }) {
    try {
      await api.createTask({ state, repoId, prompt, title });
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  const visibleTasks = repoFilter === 'all' ? tasks : tasks.filter(t => t.repoId === repoFilter);
  const active = tasks.find(t => t.id === activeId);
  const inProgressIds = new Set((config?.columns || []).filter(c => c.behavior === 'run').map(c => c.id));
  const runningCount = tasks.filter(t => inProgressIds.has(t.state)).length;
  const columns = config?.columns || [];
  const noRepos = config && config.repos.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <ConfigBar config={config} theme={theme} onToggleTheme={toggleTheme} />
      <div style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', fontSize: 12 }}>
        <span>running: {runningCount} / {config?.maxConcurrent ?? '?'}</span>
        {(config?.repos?.length || 0) > 1 && (
          <>
            <span>·</span>
            <span>repo:</span>
            <select value={repoFilter} onChange={e => setRepoFilter(e.target.value)} style={{ padding: '2px 6px' }}>
              <option value="all">all</option>
              {config.repos.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </>
        )}
        {error && <span style={{ color: 'var(--danger)', marginLeft: 12 }}>error: {error}</span>}
      </div>
      {noRepos ? (
        <Welcome />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(220px, 1fr))`,
            gap: 12,
            padding: 16,
            flex: 1,
            minHeight: 0,
            overflowX: 'auto',
          }}>
            {columns.map(col => (
              <Column
                key={col.id}
                column={col}
                repos={config?.repos || []}
                skill={config?.skillsByState?.[col.id]}
                tasks={visibleTasks.filter(t => t.state === col.id)}
                repoById={repoById}
                onOpen={setActiveId}
                onAdd={addTaskInColumn}
              />
            ))}
          </div>
        </DndContext>
      )}
      {active && (
        <Detail
          task={active}
          repo={repoById[active.repoId]}
          subscribe={subscribe}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}
