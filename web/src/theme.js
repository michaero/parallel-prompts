import { useEffect, useState } from 'react';

const KEY = 'pp-theme';

function initial() {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);
  return [theme, () => setTheme(t => (t === 'light' ? 'dark' : 'light'))];
}

export function btn(variant = 'default') {
  const bg =
    variant === 'primary' ? 'var(--accent)' :
    variant === 'danger' ? 'var(--danger-bg)' :
    'var(--border)';
  const color = variant === 'primary' ? 'var(--accent-fg)' : 'var(--text)';
  return {
    background: bg,
    color,
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
  };
}
