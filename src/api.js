// Browser-side API helpers + a persistent anonymous student id (long-term memory key).

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: keep working without it */
  }
}

export function getStudentId() {
  let id = safeGet('algometis.studentId')
  if (!id) {
    id = `s_${Math.random().toString(36).slice(2, 10)}`
    safeSet('algometis.studentId', id)
  }
  return id
}
let memId = null
export const studentId = () => (memId ||= getStudentId())

async function request(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  let json
  try {
    json = await res.json()
  } catch {
    json = { error: `HTTP ${res.status}` }
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

export const api = {
  health: () => request('GET', '/api/health'),
  catalog: () => request('GET', '/api/catalog'),
  solve: (threadId, message) => request('POST', '/api/agent/solve', { threadId, message, studentId: studentId() }),
  rescore: (body) => request('POST', '/api/rescore', body),
  tutor: (body) => request('POST', '/api/agent/tutor', { ...body, studentId: studentId() }),
  profile: () => request('GET', `/api/profile/${studentId()}`),
  studied: (algoId) => request('POST', `/api/profile/${studentId()}/studied`, { algoId }).catch(() => null),
}

// Hand-off between pages (e.g. Solve → Visualize with the student's data). In-memory only.
const handoff = new Map()
export const setHandoff = (key, value) => handoff.set(key, value)
export const takeHandoff = (key) => handoff.get(key)
