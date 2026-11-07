import React from 'react'

// Small inline icon set (no icon library needed).
const P = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  play: 'M7 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  next: 'M6 5v14l9-7zM17 5h2v14h-2z',
  prev: 'M18 5v14l-9-7zM5 5h2v14H5z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  brain: 'M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 3 5 3 3 0 0 0 5 1V4.5A2.5 2.5 0 0 0 9 4zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-3 5 3 3 0 0 1-5 1',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  note: 'M5 4h10l4 4v12H5zM14 4v5h5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4h-4z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
  palette: 'M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 9.7C22 5.9 17.5 3 12 3zM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM10 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
}

export function Icon({ name, size = 14, stroke = 2, style }) {
  const fill = name === 'play' || name === 'next' || name === 'prev' || name === 'pause'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}

export const Kicker = ({ children, muted }) => <div className={`kicker ${muted ? 'muted' : ''}`}>{children}</div>
export const Diff = ({ level }) => (level ? <span className={`badge-diff ${level}`}>{level}</span> : null)
export const Divider = ({ children }) => (
  <div className="divider">
    <span>{children}</span>
  </div>
)

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} className={value === it.value ? 'on' : ''} onClick={() => onChange(it.value)}>
          {it.label}
          {it.badge && <span className="new">{it.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export const CATEGORY_ACCENT = { searching: 'var(--cat-searching)', sorting: 'var(--cat-sorting)', graphs: 'var(--cat-graphs)', greedy: 'var(--cat-greedy)', dp: 'var(--cat-dp)' }
