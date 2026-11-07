// Long-term memory: one JSON file of student profiles. Simple, portable, and easy to inspect.
// Swap this module for MongoDB/SQLite later; the agent only uses getProfile/record*.

import fs from 'node:fs'
import path from 'node:path'

export function createProfileStore(dataDir) {
  const file = path.join(dataDir, 'profiles.json')
  let db = {}
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    db = {}
  }
  let timer = null
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
      fs.renameSync(tmp, file)
    }, 100)
  }
  const blank = (id) => ({ id, name: null, createdAt: new Date().toISOString(), studied: {}, recommended: [], tutorQuestions: {} })
  const get = (id) => (db[id] ||= blank(id))
  const cleanId = (id) => String(id || 'anonymous').replace(/[^\w-]/g, '').slice(0, 64) || 'anonymous'

  return {
    getProfile(studentId) {
      const p = get(cleanId(studentId))
      const struggles = Object.entries(p.tutorQuestions)
        .filter(([, n]) => n >= 3)
        .map(([algo]) => algo)
      return { ...structuredClone(p), struggles }
    },
    setName(studentId, name) {
      get(cleanId(studentId)).name = String(name || '').slice(0, 40) || null
      save()
    },
    recordStudied(studentId, algoId) {
      const p = get(cleanId(studentId))
      const s = (p.studied[algoId] ||= { count: 0, last: null })
      s.count++
      s.last = new Date().toISOString()
      save()
    },
    recordRecommendation(studentId, algoId, problem) {
      const p = get(cleanId(studentId))
      p.recommended.unshift({ algoId, problem: String(problem).slice(0, 200), at: new Date().toISOString() })
      p.recommended = p.recommended.slice(0, 30)
      save()
    },
    recordTutorQuestion(studentId, algoId) {
      const p = get(cleanId(studentId))
      p.tutorQuestions[algoId] = (p.tutorQuestions[algoId] || 0) + 1
      save()
    },
    flush() {
      clearTimeout(timer)
      const tmp = `${file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
      fs.renameSync(tmp, file)
    },
  }
}
