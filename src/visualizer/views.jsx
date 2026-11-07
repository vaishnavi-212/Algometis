import React, { useMemo } from 'react'

const Legend = ({ items }) => (
  <div className="legend">
    {items.map(([label, color]) => (
      <span key={label}>
        <i style={{ background: color }} />
        {label}
      </span>
    ))}
  </div>
)

// ---------------------------------------------------------------- array (bars slide when items move)
export function ArrayView({ view, compact }) {
  const vals = view.values
  const n = vals.length
  const ids = view.ids || vals.map((_, i) => i)
  const max = Math.max(1, ...vals.map((v) => Math.abs(v)))
  const hasNeg = vals.some((v) => v < 0)
  const H = compact ? 150 : 190
  const base = hasNeg ? H * 0.6 : H
  const scale = (hasNeg ? H * 0.55 : H - 24) / max
  const ptrAt = {}
  for (const [name, idx] of Object.entries(view.pointers || {})) (ptrAt[idx] ||= []).push(name)
  const stateOf = (i) => view.highlight?.[i] || (view.sorted?.includes(i) ? 'sorted' : '')
  const items = vals.map((v, i) => ({ v, i, id: ids[i] })).sort((a, b) => a.id - b.id) // stable DOM order → CSS transitions
  return (
    <div className="stack-sm">
      <div className="bars" style={{ height: H + (view.labels ? 74 : 56) }}>
        {items.map(({ v, i, id }) => {
          const st = stateOf(i)
          const dim = view.range && (i < view.range[0] || i > view.range[1])
          const h = Math.max(4, Math.abs(v) * scale)
          return (
            <div key={id} style={{ position: 'absolute', top: 0, left: 0, width: `${100 / n}%`, height: H, transform: `translateX(${i * 100}%)`, transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div
                className={`bar ${st} ${dim ? 'dim' : ''}`}
                style={{ left: '12%', right: '12%', bottom: 'auto', top: v >= 0 ? base - h : base, height: h, background: v >= 0 ? 'var(--v-bar)' : 'var(--v-neg)' }}
              >
                <span className="bv" style={v < 0 ? { top: 'auto', bottom: -18 } : undefined}>
                  {v}
                </span>
              </div>
              <div style={{ position: 'absolute', top: H + 6, left: 0, right: 0, textAlign: 'center' }}>
                <div className="tiny subtle">{i}</div>
                {view.labels && (
                  <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {view.labels[i]}
                  </div>
                )}
                {ptrAt[i] && <div style={{ color: 'var(--cyan)', fontWeight: 700, fontSize: 11 }}>↑{ptrAt[i].join(',')}</div>}
              </div>
            </div>
          )
        })}
        {hasNeg && <div style={{ position: 'absolute', left: 0, right: 0, top: base, borderTop: '1px dashed var(--border-strong)' }} />}
      </div>
      {!compact && (
        <div className="elements">
          {vals.map((v, i) => (
            <span key={i} className={`el ${stateOf(i)}`}>
              {v}
            </span>
          ))}
        </div>
      )}
      <Legend items={[['compare', 'var(--v-compare)'], ['swap / write', 'var(--v-swap)'], ['pivot / key', 'var(--v-pivot)'], ['found', 'var(--v-found)'], ['sorted', 'var(--v-sorted)'], ['outside range', 'var(--v-dim)']]} />
    </div>
  )
}

// ---------------------------------------------------------------- recursion tree (merge / quick sort)
export function RecursionTree({ tree }) {
  const layout = useMemo(() => {
    if (!tree?.nodes?.length) return null
    const kids = {}
    tree.nodes.forEach((n) => n.parent != null && (kids[n.parent] ||= []).push(n.id))
    const pos = {}
    let leaf = 0
    const depthOf = {}
    const place = (id, d) => {
      depthOf[id] = d
      const ch = kids[id] || []
      if (!ch.length) pos[id] = leaf++
      else {
        ch.forEach((c) => place(c, d + 1))
        pos[id] = (pos[ch[0]] + pos[ch[ch.length - 1]]) / 2
      }
    }
    tree.nodes.filter((n) => n.parent == null).forEach((n) => place(n.id, 0))
    const maxD = Math.max(...Object.values(depthOf))
    return { pos, depthOf, leaves: Math.max(1, leaf), maxD }
  }, [tree])
  if (!layout) return null
  const colW = 74
  const rowH = 46
  const W = Math.max(320, layout.leaves * colW)
  const Hh = (layout.maxD + 1) * rowH + 10
  const xy = (id) => [layout.pos[id] * colW + colW / 2, layout.depthOf[id] * rowH + 20]
  const color = { active: ['var(--v-swap)', 'var(--v-on-swap)'], waiting: ['var(--v-compare-soft)', 'var(--text-strong)'], done: ['var(--v-found-soft)', 'var(--text-strong)'] }
  return (
    <div className="tree-wrap">
      <svg viewBox={`0 0 ${W} ${Hh}`} width={W} height={Hh} style={{ display: 'block', margin: '0 auto', maxWidth: 'none' }} role="img" aria-label="recursion tree">
        {tree.nodes.map((n) =>
          n.parent != null ? (
            <line key={`e${n.id}`} x1={xy(n.parent)[0]} y1={xy(n.parent)[1] + 11} x2={xy(n.id)[0]} y2={xy(n.id)[1] - 11} style={{ stroke: 'var(--border-strong)', strokeWidth: 1.5 }} />
          ) : null
        )}
        {tree.nodes.map((n) => {
          const [x, y] = xy(n.id)
          const w = Math.min(colW * 2.4, Math.max(34, n.label.length * 6.6 + 14))
          const [fill, ink] = color[n.state] || color.waiting
          const active = tree.active === n.id
          return (
            <g key={n.id} className="fade-key">
              <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={7} style={{ fill, stroke: active ? 'var(--v-swap)' : 'var(--border-strong)', strokeWidth: active ? 2 : 1 }} />
              <text x={x} y={y + 4} textAnchor="middle" style={{ fill: ink, fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: active ? 700 : 500 }}>
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
      <Legend items={[['working on it', 'var(--v-swap)'], ['waiting for children', 'var(--v-compare-soft)'], ['sorted', 'var(--v-found)']]} />
    </div>
  )
}

// ---------------------------------------------------------------- graph
const NODE = {
  idle: ['var(--surface-strong)', 'var(--border-strong)', null],
  frontier: ['var(--v-compare-soft)', 'var(--v-compare)', null],
  current: ['var(--v-swap-soft)', 'var(--v-swap)', 'var(--v-swap)'],
  settled: ['var(--v-found-soft)', 'var(--v-found)', null],
  path: ['var(--v-path)', 'var(--v-path)', 'var(--v-path)'],
}
const EDGE = {
  idle: { stroke: 'var(--border-strong)', width: 1.6 },
  tree: { stroke: 'var(--v-found)', width: 3 },
  considered: { stroke: 'var(--v-swap)', width: 3.5, dash: '7 5', flow: true },
  rejected: { stroke: 'var(--v-pivot)', width: 2.5, dash: '3 5' },
  path: { stroke: 'var(--v-path)', width: 5 },
}

export function GraphView({ view, compact }) {
  const W = 640
  const H = compact ? 360 : 400
  const n = view.nodes.length
  const cx = W / 2
  const cy = H / 2 - 4
  const R = Math.min(H / 2 - 46, 60 + n * 14)
  const pos = Object.fromEntries(view.nodes.map((name, i) => [name, n === 1 ? [cx, cy] : [cx + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), cy + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)]]))
  const r = 22
  return (
    <div className="stack-sm">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="graph state">
        <defs>
          {Object.entries(EDGE).map(([k, e]) => (
            <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1L9 5L1 9z" style={{ fill: e.stroke }} />
            </marker>
          ))}
        </defs>
        {view.edges.map((e, i) => {
          const st = view.edgeState?.[i] || 'idle'
          const s = EDGE[st] || EDGE.idle
          const [x1, y1] = pos[e.from]
          const [x2, y2] = pos[e.to]
          const len = Math.hypot(x2 - x1, y2 - y1) || 1
          const ux = (x2 - x1) / len
          const uy = (y2 - y1) / len
          const pad = r + (view.directed ? 4 : 0)
          const mx = (x1 + x2) / 2 - uy * 13
          const my = (y1 + y2) / 2 + ux * 13
          return (
            <g key={i}>
              <line
                className={s.flow ? 'edge-flow' : ''}
                x1={x1 + ux * r}
                y1={y1 + uy * r}
                x2={x2 - ux * pad}
                y2={y2 - uy * pad}
                markerEnd={view.directed ? `url(#arr-${st in EDGE ? st : 'idle'})` : undefined}
                style={{ stroke: s.stroke, strokeWidth: s.width, strokeDasharray: s.dash, transition: 'stroke .25s, stroke-width .25s', filter: st === 'path' ? 'drop-shadow(0 0 5px var(--v-path))' : undefined }}
              />
              {e.weight != null && (
                <g>
                  <rect x={mx - 16} y={my - 10} width="32" height="19" rx="6" style={{ fill: 'var(--surface-strong)', stroke: st === 'idle' ? 'var(--border)' : s.stroke }} />
                  <text x={mx} y={my + 4} textAnchor="middle" style={{ fill: 'var(--text-strong)', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                    {e.weight}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        {view.nodes.map((name) => {
          const [x, y] = pos[name]
          const st = view.nodeState?.[name] || 'idle'
          const [fill, stroke, glow] = NODE[st] || NODE.idle
          const badge = view.badges?.[name]
          const below = y > cy - 10
          return (
            <g key={name}>
              {st === 'current' && <circle className="node-pulse" cx={x} cy={y} r={r} style={{ fill: 'none', stroke: 'var(--v-swap)', strokeWidth: 2 }} />}
              <circle cx={x} cy={y} r={r} style={{ fill, stroke, strokeWidth: st === 'idle' ? 1.5 : 2.5, transition: 'all .3s', filter: glow ? `drop-shadow(0 0 8px ${glow})` : undefined }} />
              {badge != null && (
                <text x={x} y={y + 4} textAnchor="middle" style={{ fill: st === 'path' ? 'var(--v-on-path)' : 'var(--text-strong)', fontSize: String(badge).length > 4 ? 9.5 : 12, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                  {badge}
                </text>
              )}
              <text x={x} y={below ? y + r + 16 : y - r - 8} textAnchor="middle" style={{ fill: 'var(--text-strong)', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                {name}
              </text>
            </g>
          )
        })}
      </svg>
      {view.aux?.length > 0 && (
        <div className="aux">
          {view.aux.map((a) => (
            <div key={a.title}>
              <span className="aux-t">{a.title}</span>
              {a.items.length ? a.items.map((it, i) => <span key={i} className="qchip">{it}</span>) : <span className="tiny subtle">empty</span>}
            </div>
          ))}
        </div>
      )}
      {!compact && <Legend items={[['current', 'var(--v-swap)'], ['discovered / queued', 'var(--v-compare)'], ['done / in tree', 'var(--v-found)'], ['edge being checked', 'var(--v-swap)'], ['final answer', 'var(--v-path)'], ['rejected', 'var(--v-pivot)']]} />}
    </div>
  )
}

// ---------------------------------------------------------------- DP table / matrix
export function TableView({ view, compact }) {
  return (
    <div className="stack-sm">
      <div className="tiny muted" style={{ textAlign: 'center' }}>
        {view.caption}
      </div>
      <div className="scroll-x">
        <table className="dpt" style={compact ? { fontSize: 11 } : undefined}>
          <thead>
            <tr>
              <th />
              {view.colHeaders.map((h, j) => (
                <th key={j} className={view.focusCol === j ? 'focus' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.cells.map((row, i) => (
              <tr key={i}>
                <th className={view.focusRow === i ? 'focus' : ''} style={{ textAlign: 'right' }}>
                  {view.rowHeaders[i]}
                </th>
                {row.map((cell, j) => {
                  const hl = view.highlight?.[`${i},${j}`]
                  const focus = view.focusRow === i || view.focusCol === j
                  return (
                    <td key={j} className={hl || (cell === '' ? 'empty' : focus ? 'focus' : '')}>
                      {cell}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && <Legend items={[['cell being filled', 'var(--v-swap)'], ['cells it uses', 'var(--v-compare)'], ['updated', 'var(--v-found)'], ['trace-back', 'var(--v-sorted)']]} />}
    </div>
  )
}

// ---------------------------------------------------------------- items (greedy)
export function ItemsView({ view }) {
  const m = view.meter
  return (
    <div className="items">
      {view.items.map((it, i) => (
        <div key={i} className={`item-row ${it.state}`}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{it.name}</div>
            <div className="tiny muted">{it.sub}</div>
          </div>
          <div className="meter">
            <span style={{ width: `${Math.round(it.fill * 100)}%` }} />
          </div>
        </div>
      ))}
      {m && (
        <div>
          <div className="row tiny muted">
            <span className="grow">{m.label}</span>
            <span>
              {Math.round(m.used * 100) / 100} / {m.total}
            </span>
          </div>
          <div className="meter">
            <span style={{ width: `${Math.min(100, (m.used / m.total) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- timeline (scheduling)
export function TimelineView({ view }) {
  const acts = view.activities
  const t0 = Math.floor(Math.min(...acts.map((a) => a.start)))
  const t1 = Math.ceil(Math.max(...acts.map((a) => a.end)))
  const L = 100
  const W = 640
  const rowH = 30
  const H = acts.length * rowH + 40
  const x = (t) => L + ((t - t0) / Math.max(1e-9, t1 - t0)) * (W - L - 20)
  const color = { idle: ['var(--chip)', 'var(--border-strong)'], current: ['var(--v-swap-soft)', 'var(--v-swap)'], chosen: ['var(--v-found-soft)', 'var(--v-found)'], rejected: ['var(--v-pivot-soft)', 'var(--v-pivot)'] }
  const ticks = []
  for (let t = t0; t <= t1; t++) ticks.push(t)
  return (
    <div className="stack-sm">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="timeline">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={6} y2={H - 24} style={{ stroke: 'var(--border)' }} />
            <text x={x(t)} y={H - 8} textAnchor="middle" style={{ fill: 'var(--subtle)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              {t}
            </text>
          </g>
        ))}
        {acts.map((a, i) => {
          const [fill, stroke] = color[a.state] || color.idle
          return (
            <g key={a.name} opacity={a.state === 'rejected' ? 0.6 : 1}>
              <text x={L - 8} y={14 + i * rowH + 9} textAnchor="end" style={{ fill: 'var(--text-strong)', fontSize: 12, fontWeight: 600 }}>
                {a.name}
              </text>
              <rect x={x(a.start)} y={8 + i * rowH} width={Math.max(4, x(a.end) - x(a.start))} height={rowH - 10} rx="6" style={{ fill, stroke, strokeWidth: a.state === 'current' ? 2.5 : 1.3, transition: 'all .3s' }} />
            </g>
          )
        })}
        {view.lastEnd != null && <line x1={x(view.lastEnd)} x2={x(view.lastEnd)} y1={2} y2={H - 24} style={{ stroke: 'var(--v-path)', strokeWidth: 2, strokeDasharray: '5 4', transition: 'all .3s' }} />}
      </svg>
      <Legend items={[['checking', 'var(--v-swap)'], ['picked', 'var(--v-found)'], ['skipped (overlap)', 'var(--v-pivot)'], ['room busy until', 'var(--v-path)']]} />
    </div>
  )
}

export function StepView({ view, compact }) {
  if (!view) return null
  if (view.kind === 'array') return <ArrayView view={view} compact={compact} />
  if (view.kind === 'graph') return <GraphView view={view} compact={compact} />
  if (view.kind === 'table') return <TableView view={view} compact={compact} />
  if (view.kind === 'items') return <ItemsView view={view} />
  if (view.kind === 'timeline') return <TimelineView view={view} />
  return <pre>{JSON.stringify(view, null, 2)}</pre>
}
