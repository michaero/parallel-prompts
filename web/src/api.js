const j = (r) => r.ok ? r.json() : r.json().then(e => Promise.reject(new Error(e.error || r.statusText)));

export const api = {
  listTasks: () => fetch('/api/tasks').then(j),
  createTask: (body) => fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  patchTask: (id, body) => fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  deleteTask: (id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(j),
  log: (id) => fetch(`/api/tasks/${id}/log`).then(r => r.text()),
  diff: (id) => fetch(`/api/tasks/${id}/diff`).then(r => r.text()),
  getConfig: () => fetch('/api/config').then(j),
  setConfig: (body) => fetch('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  browse: (path) => fetch(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`).then(j),
  skills: () => fetch('/api/skills').then(j),
  addRepo: (body) => fetch('/api/repos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  updateRepo: (id, body) => fetch(`/api/repos/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  removeRepo: (id) => fetch(`/api/repos/${id}`, { method: 'DELETE' }).then(j),
  sendInput: (id, text) => fetch(`/api/tasks/${id}/input`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).then(j),
  sendKey: (id, key) => fetch(`/api/tasks/${id}/input`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }).then(j),
  addColumn: (body) => fetch('/api/columns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  updateColumn: (id, body) => fetch(`/api/columns/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  removeColumn: (id) => fetch(`/api/columns/${id}`, { method: 'DELETE' }).then(j),
  reorderColumns: (ids) => fetch('/api/columns/order', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }).then(j),
};

export function connectWs(onEvent) {
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  let ws;
  let retry;
  const connect = () => {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch {}
    };
    ws.onclose = () => { retry = setTimeout(connect, 1500); };
  };
  connect();
  return () => { clearTimeout(retry); ws && ws.close(); };
}
