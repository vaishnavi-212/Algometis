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

// ---------------------------------------------------------------------------------------------
// LLM providers. Every provider here speaks the OpenAI chat-completions format except Anthropic.
// `models` is tried in order; on free tiers each model usually has its OWN quota, so listing two
// models doubles the free budget. `rpm` is a self-imposed requests-per-minute cap kept a little
// below the provider's free limit so we move to the next provider BEFORE getting a 429.
// Model names change over time: override with <PROVIDER>_MODELS=model-a,model-b in .env.
// ---------------------------------------------------------------------------------------------
export const PROVIDERS = {
  gemini: { kind: 'openai', label: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'], rpm: 8, keyEnv: 'GEMINI_API_KEY', signup: 'https://aistudio.google.com/apikey' },
  groq: { kind: 'openai', label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', models: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile'], rpm: 25, keyEnv: 'GROQ_API_KEY', signup: 'https://console.groq.com/keys' },
  openrouter: { kind: 'openai', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', models: ['openrouter/free'], rpm: 15, keyEnv: 'OPENROUTER_API_KEY', signup: 'https://openrouter.ai/settings/keys' },
  cerebras: { kind: 'openai', label: 'Cerebras', baseURL: 'https://api.cerebras.ai/v1', models: ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507'], rpm: 25, keyEnv: 'CEREBRAS_API_KEY', signup: 'https://cloud.cerebras.ai' },
  mistral: { kind: 'openai', label: 'Mistral', baseURL: 'https://api.mistral.ai/v1', models: ['mistral-small-latest'], rpm: 50, keyEnv: 'MISTRAL_API_KEY', signup: 'https://console.mistral.ai/api-keys' },
  openai: { kind: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', models: ['gpt-4o-mini'], rpm: 400, keyEnv: 'OPENAI_API_KEY', paid: true },
  anthropic: { kind: 'anthropic', label: 'Anthropic Claude', baseURL: 'https://api.anthropic.com/v1', models: ['claude-sonnet-5-5'], rpm: 40, keyEnv: 'ANTHROPIC_API_KEY', paid: true },
  ollama: { kind: 'openai', label: 'Ollama (local)', baseURL: 'http://localhost:11434/v1', models: ['qwen2.5:7b'], rpm: 1000, noKey: true },
}
export const DEFAULT_ORDER = ['gemini', 'groq', 'openrouter', 'cerebras', 'mistral', 'openai', 'anthropic', 'ollama']

const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean)

/**
 * Build the ordered backup chain: one entry per (provider × model × key).
 * - LLM_CHAIN=gemini,groq,...   explicit order (otherwise every provider that has a key, in DEFAULT_ORDER)
 * - <PROVIDER>_API_KEY=k1,k2    several keys are rotated before moving on
 * - <PROVIDER>_MODELS=m1,m2     override models;  <PROVIDER>_RPM=n  override the per-minute cap
 * - LLM_PROVIDER / LLM_API_KEY / LLM_MODEL / LLM_BASE_URL (v1-v7 style) still work and go first.
 */
export function buildChain(env = process.env) {
  const entries = []
  const add = (name, p, key, model, extra = {}) =>
    entries.push({ id: `${name}:${model}${key ? `:${key.slice(-4)}` : ''}`, name, kind: p.kind, label: p.label, baseURL: extra.baseURL || p.baseURL, model, apiKey: key || '', rpm: Number(env[`${name.toUpperCase()}_RPM`]) || p.rpm || 30, keyHint: key ? `…${key.slice(-4)}` : 'no key' })

  // legacy single-provider settings
  const legacy = (env.LLM_PROVIDER || '').toLowerCase().trim()
  if (legacy && legacy !== 'mock' && (env.LLM_API_KEY || PROVIDERS[legacy]?.noKey || env.LLM_BASE_URL)) {
    const p = PROVIDERS[legacy] || { kind: 'openai', label: 'OpenAI-compatible', baseURL: env.LLM_BASE_URL, models: [env.LLM_MODEL || 'default'], rpm: 30 }
    const models = env.LLM_MODEL ? [env.LLM_MODEL] : p.models
    for (const m of models) for (const k of list(env.LLM_API_KEY).length ? list(env.LLM_API_KEY) : ['']) add(legacy, p, k, m, { baseURL: env.LLM_BASE_URL })
  }

  const explicit = list(env.LLM_CHAIN).map((x) => x.toLowerCase()).filter((x) => x !== 'mock')
  const order = explicit.length ? explicit : DEFAULT_ORDER.filter((n) => n !== 'ollama' || env.OLLAMA_URL)
  for (const name of order) {
    const p = PROVIDERS[name]
    if (!p) continue
    const keys = p.noKey ? [''] : list(env[p.keyEnv])
    if (!keys.length) continue
    const models = list(env[`${name.toUpperCase()}_MODELS`]).length ? list(env[`${name.toUpperCase()}_MODELS`]) : p.models
    const baseURL = name === 'ollama' && env.OLLAMA_URL ? env.OLLAMA_URL : undefined
    for (const m of models) for (const k of keys) if (!entries.some((e) => e.name === name && e.model === m && e.apiKey === k)) add(name, p, k, m, { baseURL })
  }
  return entries
}

export const config = {
  port: Number(process.env.PORT || 8787),
  llmChain: buildChain(),
  llmRouter: {
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
    maxWaitMs: Number(process.env.LLM_MAX_WAIT_MS || 8000),
    offlineFallback: process.env.LLM_OFFLINE_FALLBACK !== 'off',
  },
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  rateLimit: { windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000), max: Number(process.env.RATE_LIMIT_MAX || 40) },
  agent: { maxExecutorTurns: Number(process.env.AGENT_MAX_TURNS || 12), maxRevisions: 2, maxClarifyRounds: 2, maxTutorTurns: 6 },
}
