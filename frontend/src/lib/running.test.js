import { describe, expect, it } from 'vitest'
import {
  fmtDuration, fmtPace, loadJump, longestRun, monthKm, normalizeRun, normalizeRunsState, paceOf,
  parseDuration, recentTotals, records, weekTotals, weeklySeries,
} from './running.js'

const run = (d, km, sec, extra = {}) => ({ id: d + '-' + km, d, km, sec, type: 'easy', ...extra })

describe('durations and pace', () => {
  it('reads minutes, mm:ss and h:mm:ss', () => {
    expect(parseDuration('45')).toBe(2700)
    expect(parseDuration('45:30')).toBe(2730)
    expect(parseDuration('1:02:10')).toBe(3730)
    expect(parseDuration('27,5')).toBe(1650)
  })
  it('refuses what is not a duration', () => {
    for (const s of ['', 'abc', '1:75', '0', '1:2:3:4', '-5']) expect(parseDuration(s)).toBeNull()
  })
  it('formats durations and paces', () => {
    expect(fmtDuration(1530)).toBe('25:30')
    expect(fmtDuration(3725)).toBe('1:02:05')
    expect(fmtPace(312)).toBe('5:12')
    expect(fmtPace(null)).toBe('–')
    expect(paceOf({ km: 10, sec: 3000 })).toBe(300)
    expect(paceOf({ km: 0, sec: 3000 })).toBeNull()
  })
})

describe('normalizing', () => {
  it('drops runs without date, distance or time, and clamps the optional fields', () => {
    expect(normalizeRun({ id: 'a', d: '2026-10-01', km: 0, sec: 100 })).toBeNull()
    expect(normalizeRun({ id: 'a', d: 'hier', km: 5, sec: 100 })).toBeNull()
    expect(normalizeRun({ id: 'a', d: '2026-10-01', km: 5.004, sec: 1500.4, type: 'zzz', rpe: 14, hr: 150 }))
      .toEqual({ id: 'a', d: '2026-10-01', km: 5, sec: 1500, type: 'easy', hr: 150 })
  })
  it('sorts, dedupes by id and keeps a sane weekly goal', () => {
    const s = normalizeRunsState({ runs: [run('2026-10-03', 5, 1500), run('2026-10-01', 8, 2600), run('2026-10-03', 5, 1500)], runGoalKm: -2 })
    expect(s.runs.map(r => r.d)).toEqual(['2026-10-01', '2026-10-03'])
    expect(s.runGoalKm).toBe(20)
  })
})

describe('totals', () => {
  const runs = [run('2026-10-12', 6, 1800), run('2026-10-14', 10, 3300), run('2026-10-19', 5, 1500), run('2026-10-21', 8, 2560)]
  it('counts the current week from its first day', () => {
    expect(weekTotals(runs, '2026-10-21')).toEqual({ n: 2, km: 13, sec: 4060 })
    // Sunday start: the week of Wed 21 Oct begins on Sun 18 Oct
    expect(weekTotals(runs, '2026-10-21', 0).km).toBe(13)
  })
  it('lists weeks oldest first, empty ones included', () => {
    const s = weeklySeries(runs, '2026-10-21', 3)
    expect(s.map(w => w.wk)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
    expect(s.map(w => w.km)).toEqual([0, 16, 13])
  })
  it('sums the month and the last 30 days with their pace', () => {
    expect(monthKm(runs, '2026-10-21')).toBe(29)
    const r = recentTotals(runs, '2026-10-21', 30)
    expect(r.n).toBe(4)
    expect(Math.round(r.pace)).toBe(Math.round(9160 / 29))
  })
  it('finds the longest run', () => {
    expect(longestRun(runs).km).toBe(10)
    expect(longestRun([])).toBeNull()
  })
})

describe('records', () => {
  it('takes the best pace among runs at least as long as the distance', () => {
    const r = records([run('2026-10-01', 5, 1400), run('2026-10-02', 12, 3600), run('2026-10-03', 3, 600)])
    expect(r[0].pace).toBe(280)          // 5 km at 4:40, the 3 km is too short to count
    expect(r[1].pace).toBe(300)          // 10 km from the 12 km run
    expect(r[1].time).toBe(3000)
    expect(r[2].pace).toBeNull()         // no half yet
  })
})

describe('10 % rule', () => {
  it('flags a week well above the three before it', () => {
    const runs = [run('2026-09-30', 20, 6000), run('2026-10-07', 20, 6000), run('2026-10-14', 20, 6000), run('2026-10-20', 26, 7800)]
    expect(loadJump(runs, '2026-10-21')).toBe(0.3)
  })
  it('stays quiet on a steady week or a tiny base', () => {
    expect(loadJump([run('2026-10-07', 20, 6000), run('2026-10-14', 20, 6000), run('2026-09-30', 20, 6000), run('2026-10-20', 21, 6300)], '2026-10-21')).toBeNull()
    expect(loadJump([run('2026-10-20', 10, 3000)], '2026-10-21')).toBeNull()
  })
})
