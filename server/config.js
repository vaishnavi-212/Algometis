import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Minimal .env loader (no dependency). Existing environment variables win.
function loadDotEnv() {
  const file = path.join(ROOT, '.env')
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadDotEnv()

// Provider presets. Model names change over time: override with LLM_MODEL if a default is retired.
export const PROVIDERS = {
  gemini: { kind: 'openai', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', label: 'Google Gemini' },
  groq: { kind: 'openai', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', label: 'Groq' },
  openai: { kind: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'OpenAI' },
  openrouter: { kind: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', label: 'OpenRouter' },
  ollama: { kind: 'openai', baseURL: 'http://localhost:11434/v1', model: 'qwen2.5:7b', label: 'Ollama (local)', noKey: true },
  anthropic: { kind: 'anthropic', baseURL: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', label: 'Anthropic Claude' },
  mock: { kind: 'mock', model: 'rule-based-demo', label: 'Offline demo mode', noKey: true },
}

function resolveProvider() {
  let name = (process.env.LLM_PROVIDER || '').toLowerCase().trim()
  if (!name) name = process.env.LLM_API_KEY ? 'gemini' : 'mock'
  const preset = PROVIDERS[name] || (process.env.LLM_BASE_URL ? { kind: 'openai', label: 'OpenAI-compatible' } : null)
  if (!preset) throw new Error(`Unknown LLM_PROVIDER "${name}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`)
  return {
    name,
    kind: preset.kind,
    label: preset.label,
    baseURL: process.env.LLM_BASE_URL || preset.baseURL,
    model: process.env.LLM_MODEL || preset.model,
    apiKey: process.env.LLM_API_KEY || '',
    noKey: !!preset.noKey,
  }
}

export const config = {
  port: Number(process.env.PORT || 8787),
  llm: resolveProvider(),
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  rateLimit: { windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000), max: Number(process.env.RATE_LIMIT_MAX || 40) },
  agent: { maxExecutorTurns: Number(process.env.AGENT_MAX_TURNS || 12), maxRevisions: 2, maxClarifyRounds: 2, maxTutorTurns: 6 },
}
