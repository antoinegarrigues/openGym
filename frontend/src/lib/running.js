// Running log (fork): pure helpers for the Running screen. A run is not a set — no load, no reps,
// no progression rule — so it gets its own small model instead of bending the workout one:
//   { id, d: 'YYYY-MM-DD', km, sec, type, rpe?: 1..10, hr?: bpm, note?, _ts }
// Distance in kilometres, duration in seconds; pace is always derived, never stored.
import { isoOf, startOfWeek, MONDAY } from './format.js'

export const RUN_TYPES = [
  { key: 'easy', label: 'Easy run' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'intervals', label: 'Intervals' },
  { key: 'long', label: 'Long run' },
  { key: 'race', label: 'Race' },
]
export const RUN_TYPE_KEYS = RUN_TYPES.map(t => t.key)

// The usual race distances; a record is the best average pace held over at least that far.
export const RECORD_DISTANCES = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Half marathon' },
  { km: 42.195, label: 'Marathon' },
]

/** "45" (minutes), "45:30", "1:02:10" → seconds; anything else → null. */
export function parseDuration(text) {
  const s = String(text ?? '').trim().replace(',', '.')
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) { const m = +s; return m > 0 ? Math.round(m * 60) : null }
  const parts = s.split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.slice(1).some(n => n >= 60)) return null
  const sec = nums.reduce((acc, n) => acc * 60 + n, 0)
  return sec > 0 ? sec : null
}

/** 3725 → "1:02:05", 1530 → "25:30". */
export function fmtDuration(sec) {
  if (!(sec > 0)) return '–'
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return (h ? h + ':' : '') + mm + ':' + String(r).padStart(2, '0')
}

/** Seconds per kilometre, or null when either side is missing. */
export const paceOf = run => (run?.km > 0 && run?.sec > 0 ? run.sec / run.km : null)

/** 312 → "5:12". */
export function fmtPace(secPerKm) {
  if (!(secPerKm > 0) || !isFinite(secPerKm)) return '–'
  const s = Math.round(secPerKm)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** A clean copy of a run, or null when it cannot be one (no date, no distance, no time). */
export function normalizeRun(r) {
  if (!r || typeof r !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(r.d || '')) return null
  const km = round(Number(r.km), 2), sec = Math.round(Number(r.sec))
  if (!(km > 0 && km <= 400) || !(sec > 0 && sec <= 7 * 86400)) return null
  const out = { id: String(r.id || ''), d: r.d, km, sec, type: RUN_TYPE_KEYS.includes(r.type) ? r.type : 'easy' }
  const rpe = Math.round(Number(r.rpe)); if (rpe >= 1 && rpe <= 10) out.rpe = rpe
  const hr = Math.round(Number(r.hr)); if (hr >= 30 && hr <= 250) out.hr = hr
  const note = String(r.note || '').trim().slice(0, 280); if (note) out.note = note
  if (Number(r._ts) > 0) out._ts = Number(r._ts)
  return out.id ? out : null
}

/** The runs list, cleaned and sorted oldest first (what the store keeps). */
export function normalizeRunsState(state) {
  const seen = new Set()
  state.runs = (Array.isArray(state.runs) ? state.runs : []).map(normalizeRun)
    .filter(r => r && !seen.has(r.id) && seen.add(r.id))
    .sort((a, b) => a.d.localeCompare(b.d) || (a._ts || 0) - (b._ts || 0))
  const goal = Number(state.runGoalKm)
  state.runGoalKm = goal > 0 && goal <= 500 ? round(goal, 1) : 20
  return state
}

const sum = (runs, f) => runs.reduce((acc, r) => acc + f(r), 0)
const totals = runs => ({ n: runs.length, km: round(sum(runs, r => r.km), 1), sec: sum(runs, r => r.sec) })

/** Distance, count and time of the week `today` falls in. */
export function weekTotals(runs, today, ws = MONDAY) {
  const from = isoOf(startOfWeek(today, ws))
  return totals((runs || []).filter(r => r.d >= from && r.d <= today))
}

/** One point per week for the last `weeks` weeks, oldest first: { wk, km, n }. */
export function weeklySeries(runs, today, weeks = 12, ws = MONDAY) {
  const start = startOfWeek(today, ws)
  const out = []
  for (let i = weeks - 1; i >= 0; i--) {
    const a = new Date(start); a.setDate(a.getDate() - 7 * i)
    const b = new Date(a); b.setDate(b.getDate() + 6)
    const from = isoOf(a), to = isoOf(b)
    const t = totals((runs || []).filter(r => r.d >= from && r.d <= to))
    out.push({ wk: from, km: t.km, n: t.n })
  }
  return out
}

/** Totals of the last `days` days, today included, with the average pace over them. */
export function recentTotals(runs, today, days = 30) {
  const a = new Date(today + 'T12:00:00'); a.setDate(a.getDate() - (days - 1))
  const t = totals((runs || []).filter(r => r.d >= isoOf(a) && r.d <= today))
  return { ...t, pace: t.km > 0 ? t.sec / t.km : null }
}

/** Distance of the calendar month `today` falls in. */
export const monthKm = (runs, today) => round(sum((runs || []).filter(r => r.d.slice(0, 7) === today.slice(0, 7)), r => r.km), 1)

/**
 * Best effort per race distance: the fastest average pace among runs at least that long, and the
 * time it projects to over the distance. A pace held over 12 km is a fair floor for a 10 km; it
 * is never stretched the other way (a fast 5 km says nothing about a half).
 */
export function records(runs) {
  return RECORD_DISTANCES.map(({ km, label }) => {
    let best = null
    for (const r of runs || []) {
      const p = paceOf(r)
      if (p && r.km >= km - 0.05 && (!best || p < best.pace)) best = { pace: p, run: r }
    }
    return { km, label, pace: best?.pace ?? null, time: best ? best.pace * km : null, run: best?.run ?? null }
  })
}

/** The longest run, or null. */
export const longestRun = runs => (runs || []).reduce((best, r) => (!best || r.km > best.km ? r : best), null)

/**
 * The 10 % rule: this week's distance against the average of the three before it. Returns the
 * increase as a fraction when it is above 10 % and the base is worth comparing (≥ 5 km a week),
 * else null. Advice, not a block: it only colours a line on the screen.
 */
export function loadJump(runs, today, ws = MONDAY) {
  const s = weeklySeries(runs, today, 4, ws)
  const base = (s[0].km + s[1].km + s[2].km) / 3
  if (base < 5) return null
  const jump = (s[3].km - base) / base
  return jump > 0.1 ? round(jump, 2) : null
}
