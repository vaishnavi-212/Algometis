// HTTP server: JSON API + static frontend. Uses only Node built-ins.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { config, ROOT } from './config.js'
import { createLLM } from './llm/index.js'
import { createProfileStore } from './memory/store.js'
import { buildSolveGraph, freshInput } from './agent/solveGraph.js'
import { Command, MemoryCheckpointer } from './agent/graphEngine.js'
import { runTutor } from './agent/tutor.js'
import { ALGORITHMS, CATEGORIES, publicCatalog } from '../shared/registry.js'
import { FAMILIES, scoreFamily } from '../shared/scoring.js'
import { INPUT_KINDS, deriveFacts } from '../shared/schemas.js'
import { buildEvidence, validateFor } from '../shared/evidence.js'
import { jsonSafe } from '../shared/util.js'
import { analyzeCSubmission } from './agent/codeReview.js'

export function createApp({ llm = createLLM(), store = createProfileStore(config.dataDir), staticDir = path.join(ROOT, 'dist') } = {}) {
  const checkpointer = new MemoryCheckpointer()
  const solveGraph = buildSolveGraph({ checkpointer })

  // ---- tiny fixed-window rate limiter for the LLM endpoints ----
  const hits = new Map()
  const limited = (ip) => {
    const now = Date.now()
    const e = hits.get(ip)
    if (!e || now - e.start > config.rateLimit.windowMs) {
      hits.set(ip, { start: now, n: 1 })
      return false
    }
    e.n++
    return e.n > config.rateLimit.max
  }

  const send = (res, status, body) => {
    const data = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(data)
  }
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > 256 * 1024) {
          reject(Object.assign(new Error('Request body too large'), { status: 413 }))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
        } catch {
          reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }))
        }
      })
      req.on('error', reject)
    })

  const str = (v, max = 2000) => String(v ?? '').slice(0, max)

  const routes = {
    'GET /api/health': async () => ({ ok: true, provider: llm.provider, label: llm.label, model: llm.model, offlineDemo: !!llm.isMock, llm: llm.status ? llm.status() : null }),

    'GET /api/catalog': async () => ({
      categories: CATEGORIES,
      algorithms: publicCatalog(),
      families: Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, { label: f.label, candidates: f.candidates, fields: f.fields }])),
      inputKinds: Object.fromEntries(Object.entries(INPUT_KINDS).map(([k, v]) => [k, { label: v.label, limits: v.limits }])),
    }),

    'POST /api/agent/solve': async (body) => {
      const message = str(body.message).trim()
      const threadId = str(body.threadId, 80) || `t_${Date.now()}`
      const studentId = str(body.studentId, 64) || 'anonymous'
      if (!message) return [400, { error: 'message is required' }]
      const saved = await solveGraph.getState(threadId)
      let out
      try {
        if (saved?.interrupt && saved.next) out = await solveGraph.invoke(new Command({ resume: message }), { threadId, context: { llm, store } })
        else {
          if (saved) await checkpointer.delete(threadId)
          out = await solveGraph.invoke(freshInput(studentId, message), { threadId, context: { llm, store } })
        }
      } catch (e) {
        await checkpointer.delete(threadId)
        return [502, { error: `Agent failed: ${e.message}`, hint: llm.isMock ? undefined : 'Check the API keys in .env (run: npm run check-llm)' }]
      }
      const trace = out.state.trace
      if (out.status === 'interrupted') return { status: 'clarify', threadId, questions: out.interrupt.questions, message: out.interrupt.questions.join('\n'), trace, path: out.path }
      return { ...out.state.response, threadId, trace, path: out.path }
    },

    // Deterministic re-scoring for the "What I understood" editor and what-if toggles. No AI.
    'POST /api/rescore': async (body) => {
      const family = str(body.problemType, 40)
      if (!FAMILIES[family]) return [400, { error: 'unknown problemType' }]
      const input = body.input
      const kind = ALGORITHMS[FAMILIES[family].candidates[0]].inputKind
      const facts = input && !body.whatIf ? deriveFacts(kind, input) : input ? Object.fromEntries(Object.entries(deriveFacts(kind, input)).filter(([k]) => ['size', 'edges', 'capacity', 'm', 'n', 'coins'].includes(k))) : {}
      const scoring = scoreFamily(family, body.constraints || {}, facts)
      let evidence = null
      if (input && scoring.best) {
        const runnable = validateFor(scoring.best, input).valid
        evidence = runnable ? buildEvidence(scoring, input, scoring.best) : null
      }
      return jsonSafe({ scoring, evidence, chosen: scoring.best, evidenceNote: evidence ? null : 'The new best algorithm cannot run on the current data (e.g. it needs different data); edit the data to see measurements.' })
    },

    'POST /api/agent/analyze-code': async (body) => {
      const question = str(body.question, 12000).trim()
      const code = str(body.code, 50000).trim()
      if (!question || !code) return [400, { error: 'Both assignment question and C code are required.' }]
      try { return analyzeCSubmission({ question, code }) }
      catch (e) { return [400, { error: e.message }] }
    },

    'POST /api/agent/tutor': async (body) => {
      const r = await runTutor({ llm, store, studentId: str(body.studentId, 64) || 'anonymous', algoId: str(body.algoId, 40), input: body.input, stepIndex: body.stepIndex, question: str(body.question, 1000), history: Array.isArray(body.history) ? body.history : [] })
      return r.error ? [400, r] : r
    },
  }

  const profileRoute = async (method, id, action, body) => {
    if (method === 'GET' && !action) return store.getProfile(id)
    if (method === 'POST' && action === 'studied') {
      if (!ALGORITHMS[body.algoId]) return [400, { error: 'unknown algoId' }]
      store.recordStudied(id, body.algoId)
      return store.getProfile(id)
    }
    if (method === 'POST' && action === 'name') {
      store.setName(id, body.name)
      return store.getProfile(id)
    }
    return [404, { error: 'not found' }]
  }

  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' }
  const serveStatic = (req, res, pathname) => {
    const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
    let file = path.join(staticDir, safe)
    if (!file.startsWith(staticDir)) return send(res, 403, { error: 'forbidden' })
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, 'index.html')
    if (!fs.existsSync(file)) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      return res.end('Frontend not built yet. Run: npm run build')
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const { pathname } = url
    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname)
    try {
      const ip = req.socket.remoteAddress || 'local'
      if (pathname.startsWith('/api/agent/') && limited(ip)) return send(res, 429, { error: 'Too many requests. Please wait a few minutes.' })
      const body = req.method === 'POST' ? await readBody(req) : {}
      const m = pathname.match(/^\/api\/profile\/([\w-]{1,64})(?:\/(\w+))?$/)
      let result
      if (m) result = await profileRoute(req.method, m[1], m[2], body)
      else {
        const handler = routes[`${req.method} ${pathname}`]
        if (!handler) return send(res, 404, { error: 'not found' })
        result = await handler(body)
      }
      if (Array.isArray(result)) return send(res, result[0], result[1])
      return send(res, 200, result)
    } catch (e) {
      return send(res, e.status || 500, { error: e.message })
    }
  })
}

// Start when run directly: `node server/index.js`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith(path.join('server', 'index.js'))) {
  const server = createApp()
  server.listen(config.port, () => {
    const chain = config.llmChain
    console.log(`\n  AlgoMetis running → http://localhost:${config.port}`)
    if (!chain.length) console.log('  AI: offline demo mode (no API keys in .env). See .env.example to connect free providers.\n')
    else {
      console.log(`  AI backup chain (${chain.length} entries, tried top to bottom):`)
      chain.forEach((e, i) => console.log(`    ${String(i + 1).padStart(2)}. ${e.label.padEnd(18)} ${e.model.padEnd(34)} key ${e.keyHint}  (≤${e.rpm}/min)`))
      console.log(`  Offline rules are used only if every entry is unavailable. Test keys with: npm run check-llm\n`)
    }
  })
}
