import React, { useEffect, useRef, useState } from 'react'

const KW = new Set('function const let var for while if else return of in new break continue throw class import from def elif not and or is None True False lambda pass raise with as yield try except finally range len float set'.split(' '))

// Tiny syntax highlighter (no dependency): comments, strings, numbers, keywords, calls.
export function tokenize(line, lang) {
  const out = []
  const re = lang === 'python' ? /(#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g : /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g
  let last = 0
  let m
  while ((m = re.exec(line))) {
    if (m.index > last) out.push([null, line.slice(last, m.index)])
    if (m[1]) out.push(['c', m[1]])
    else if (m[2]) out.push(['s', m[2]])
    else if (m[3]) out.push(['n', m[3]])
    else if (m[4]) out.push([KW.has(m[4]) ? 'k' : 'f', m[4]])
    else if (m[5]) out.push([KW.has(m[5]) ? 'k' : null, m[5]])
    last = re.lastIndex
  }
  if (last < line.length) out.push([null, line.slice(last)])
  return out
}

export function CodeLines({ code, lang, activeLine }) {
  return code.split('\n').map((line, i) => (
    <div key={i} className={`code-line ${activeLine === i + 1 ? 'active' : ''}`}>
      <span className="ln">{i + 1}</span>
      <span>
        {tokenize(line, lang).map(([t, s], k) =>
          t ? (
            <span key={k} className={`tok-${t}`}>
              {s}
            </span>
          ) : (
            <React.Fragment key={k}>{s}</React.Fragment>
          )
        )}
        {line === '' ? ' ' : ''}
      </span>
    </div>
  ))
}

export function CodePanel({ code, lang, onLang, activeLine, title }) {
  const body = useRef(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const el = body.current?.querySelector('.code-line.active')
    if (!el || !body.current) return
    const c = body.current
    const top = el.offsetTop - c.offsetTop
    if (top < c.scrollTop + 20 || top > c.scrollTop + c.clientHeight - 40) c.scrollTo({ top: Math.max(0, top - c.clientHeight / 3), behavior: 'smooth' })
  }, [activeLine, lang])
  return (
    <div className="code">
      <div className="code-h">
        <span className="ttl">{title}</span>
        <span className="chip cyan">line {activeLine || '–'}</span>
        {['javascript', 'python'].map((l) => (
          <button key={l} className={l === lang ? 'on' : ''} onClick={() => onLang(l)}>
            {l === 'javascript' ? 'JS' : 'Python'}
          </button>
        ))}
        <button
          onClick={() =>
            navigator.clipboard
              ?.writeText(code)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => {})
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-body" ref={body}>
        <CodeLines code={code} lang={lang} activeLine={activeLine} />
      </div>
    </div>
  )
}
