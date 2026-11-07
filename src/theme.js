// Appearance: dark or light mode × colour palette × typeface pairing. Applied as data attributes on <html>
// (styles.css holds the actual colours). Saved in localStorage when the browser allows it.
const KEY = 'algometis.look.v6'

export const PALETTES = [
  { id: 'aurora', label: 'Aurora', note: 'Indigo night, violet → teal accent', bg: '#0b0c16', card: '#12142a', lbg: '#f5f5fc', lcard: '#ffffff', laccent: '#5b4bdb', laccent2: '#0b9f86', accent: '#8b7bff', accent2: '#2ee6c5' },
  { id: 'ocean', label: 'Ocean', note: 'Deep navy, sky-blue → mint accent', bg: '#07111b', card: '#0d1a29', lbg: '#f2f7fc', lcard: '#ffffff', laccent: '#0284c7', laccent2: '#059669', accent: '#38bdf8', accent2: '#34e0a1' },
  { id: 'forest', label: 'Forest', note: 'Pine green, emerald → sky accent', bg: '#08130f', card: '#0e1d17', lbg: '#f2f9f5', lcard: '#ffffff', laccent: '#058a5f', laccent2: '#0279b8', accent: '#2fe39b', accent2: '#5cc8ff' },
  { id: 'ember', label: 'Ember', note: 'Wine dark, coral → orchid accent', bg: '#140b0e', card: '#1f1116', lbg: '#fcf4f5', lcard: '#ffffff', laccent: '#e0414a', laccent2: '#b425c6', accent: '#ff6b6b', accent2: '#e879f9' },
]

export const TYPEFACES = [
  { id: 'clean', label: 'Clean', note: 'Inter Tight + Inter', sample: "'Inter Tight', 'Inter Display', 'Inter', sans-serif" },
  { id: 'friendly', label: 'Friendly', note: 'Poppins + Inter', sample: "'Poppins', 'Inter', sans-serif" },
  { id: 'editorial', label: 'Editorial', note: 'Lora + Inter', sample: "'Lora', Georgia, serif" },
]

export const MODES = ['dark', 'light']
export const DEFAULT_LOOK = { palette: 'aurora', type: 'clean', mode: 'dark' }

export function initialLook() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved && PALETTES.some((p) => p.id === saved.palette) && TYPEFACES.some((t) => t.id === saved.type)) return { ...saved, mode: MODES.includes(saved.mode) ? saved.mode : 'dark' }
  } catch {
    /* storage unavailable or bad value */
  }
  return DEFAULT_LOOK
}

export function applyLook(look) {
  const el = document.documentElement
  el.dataset.palette = look.palette
  el.dataset.type = look.type
  el.dataset.mode = look.mode || 'dark'
  try {
    localStorage.setItem(KEY, JSON.stringify(look))
  } catch {
    /* storage unavailable */
  }
}
