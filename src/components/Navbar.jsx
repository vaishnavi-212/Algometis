import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PALETTES, TYPEFACES } from '../theme.js'
import { ALGORITHMS } from '../../shared/registry.js'
import { LEARNING } from '../../shared/learning.js'
import { Icon } from './ui.jsx'

const LINKS = [
  ['home', 'Home', '#/'],
  ['mentor', 'AI Mentor', '#/mentor'],
  ['code-review', 'Code Review', '#/code-review'],
  ['explore', 'Visualizers', '#/explore'],
  ['practice', 'Practice', '#/practice'],
]

function Search() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return Object.entries(ALGORITHMS)
      .map(([id, a]) => {
        const hay = `${a.name} ${id.replace(/_/g, ' ')} ${a.whenToUse} ${LEARNING[id]?.realWorld.join(' ')}`.toLowerCase()
        const score = a.name.toLowerCase().startsWith(t) ? 3 : a.name.toLowerCase().includes(t) ? 2 : hay.includes(t) ? 1 : 0
        return { id, a, score }
      })
      .filter((x) => x.score)
      .sort((x, y) => y.score - x.score)
      .slice(0, 8)
  }, [q])
  const go = (id) => {
    window.location.hash = `#/visualize/${id}`
    setQ('')
    setOpen(false)
  }
  return (
    <div className="search-wrap">
      <span className="ico">
        <Icon name="search" size={13} />
      </span>
      <input
        value={q}
        placeholder="Search algorithms…"
        aria-label="Search algorithms"
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setSel(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, hits.length - 1))
          if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
          if (e.key === 'Enter' && hits[sel]) go(hits[sel].id)
        }}
      />
      {open && hits.length > 0 && (
        <div className="search-results">
          {hits.map((h, i) => (
            <a key={h.id} href={`#/visualize/${h.id}`} className={i === sel ? 'sel' : ''} onMouseDown={() => go(h.id)}>
              <div style={{ fontWeight: 600 }}>{h.a.name}</div>
              <div className="tiny muted">{h.a.whenToUse}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/** Logo mark: three ascending bars, i.e. a list being sorted. */
export function LogoMark({ size = 28 }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="0.5" y="0.5" width="27" height="27" rx="7.5" className="lm-box" />
      <rect x="7" y="15" width="3.6" height="6" rx="1.2" className="lm-bar dim" />
      <rect x="12.2" y="11" width="3.6" height="10" rx="1.2" className="lm-bar dim" />
      <rect x="17.4" y="7" width="3.6" height="14" rx="1.2" className="lm-bar" />
    </svg>
  )
}

function Appearance({ look, onLook }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="appearance" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Appearance" aria-expanded={open} title="Appearance">
        <Icon name="palette" size={15} />
      </button>
      {open && (
        <div className="appearance-pop" role="dialog" aria-label="Appearance">
          <div className="ap-label">Mode</div>
          <div className="seg mode-seg">
            {['dark', 'light'].map((m) => (
              <button key={m} className={look.mode === m ? 'on' : ''} onClick={() => onLook({ ...look, mode: m })}>
                <Icon name={m === 'dark' ? 'moon' : 'sun'} size={13} /> {m === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          <div className="ap-label">Colour</div>
          <div className="ap-grid">
            {PALETTES.map((p) => (
              <button key={p.id} className={`ap-opt ${look.palette === p.id ? 'on' : ''}`} onClick={() => onLook({ ...look, palette: p.id })} title={p.note}>
                <span className="swatch" style={{ background: look.mode === 'light' ? p.lbg : p.bg }}>
                  <span style={{ background: look.mode === 'light' ? p.lcard : p.card }} />
                  <span style={{ background: look.mode === 'light' ? `linear-gradient(90deg, ${p.laccent}, ${p.laccent2})` : `linear-gradient(90deg, ${p.accent}, ${p.accent2})` }} />
                </span>
                <span className="ap-name">{p.label}</span>
              </button>
            ))}
          </div>
          <div className="ap-label">Typeface</div>
          <div className="ap-list">
            {TYPEFACES.map((t) => (
              <button key={t.id} className={`ap-row ${look.type === t.id ? 'on' : ''}`} onClick={() => onLook({ ...look, type: t.id })}>
                <span className="ap-aa" style={{ fontFamily: t.sample }}>
                  Aa
                </span>
                <span className="ap-txt">
                  <span className="ap-name">{t.label}</span>
                  <span className="ap-note">{t.note}</span>
                </span>
                {look.type === t.id && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const STATE_TEXT = { ready: 'ready', busy: 'at its per-minute cap', cooling: 'cooling down', disabled: 'switched off' }

/** Live status of the AI backup chain (from /api/health, refreshed every 20 s by App). */
function AIStatus({ health }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const st = health.llm
  const mode = health.offlineDemo || !st ? 'offline' : st.mode
  const text = mode === 'offline' ? 'Offline mode' : mode === 'busy' ? 'AI busy · retrying' : `AI online · ${st.ready}/${st.configured}`
  return (
    <div className="appearance hide-sm" ref={ref}>
      <button className={`status ${mode}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="AI provider status">
        <i />
        {text}
      </button>
      {open && (
        <div className="appearance-pop ai-pop" role="dialog" aria-label="AI status">
          <div className="ap-label">AI backup chain</div>
          {!st || !st.configured ? (
            <p className="small muted">
              No API keys yet, so answers come from offline rules. Add free keys to <code>.env</code> (see <code>.env.example</code>) and restart. Each key becomes a backup.
            </p>
          ) : (
            <>
              <p className="tiny subtle">Tried top to bottom. If one is rate-limited or down, the next answers automatically.</p>
              <ol className="ai-chain">
                {st.chain.map((c) => (
                  <li key={c.id} className={c.state}>
                    <i />
                    <span className="ai-name">
                      {c.label} <span className="mono">{c.model}</span>
                    </span>
                    <span className="ai-state">
                      {STATE_TEXT[c.state]}
                      {c.retryInSec > 0 && c.state !== 'ready' ? ` · ${c.retryInSec > 120 ? `${Math.round(c.retryInSec / 60)} min` : `${c.retryInSec}s`}` : ''}
                    </span>
                    {c.reason && c.state !== 'ready' && <span className="ai-reason">{c.reason}</span>}
                  </li>
                ))}
              </ol>
              <div className="ai-stats tiny subtle">
                {st.stats.served} AI answers · {st.stats.failovers} automatic switches · {st.stats.offlineAnswers} offline fallbacks
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function Navbar({ page, look, onLook, health }) {
  return (
    <header className="nav">
      <div className="nav-in">
        <a className="logo" href="#/">
          <LogoMark />
          AlgoMetis
        </a>
        <nav className="nav-links">
          {LINKS.map(([key, label, href]) => (
            <a key={key} href={href} className={page === key ? 'active' : ''}>
              {label}
            </a>
          ))}
        </nav>
        <span className="spacer" />
        <Search />
        {health && <AIStatus health={health} />}
        <button className="icon-btn" onClick={() => onLook({ ...look, mode: look.mode === 'light' ? 'dark' : 'light' })} aria-label={`Switch to ${look.mode === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${look.mode === 'light' ? 'dark' : 'light'} mode`}>
          <Icon name={look.mode === 'light' ? 'moon' : 'sun'} size={15} />
        </button>
        <Appearance look={look} onLook={onLook} />
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-in">
        <span className="logo small-logo">
          <LogoMark size={22} />
          AlgoMetis
        </span>
        <span>Understand algorithms by reasoning, not memorising.</span>
      </div>
    </footer>
  )
}
