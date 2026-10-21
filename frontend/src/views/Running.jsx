import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import {
  RUN_TYPES, fmtDuration, fmtPace, loadJump, longestRun, monthKm, normalizeRunsState, paceOf,
  parseDuration, recentTotals, records, weekTotals, weeklySeries,
} from '../lib/running.js'
import { fmtDate, fmtNum, todayISO, uid, weekStartOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Segmented, SelectRow, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'

// Every write leaves the list in its sorted, one-entry-per-id shape (normalizeRunsState).
const update = fn => useStore.getState().update(s => { fn(s); normalizeRunsState(s) })
const toast = message => useUI.getState().toast(message)
const typeLabel = key => t(RUN_TYPES.find(x => x.key === key)?.label || 'Easy run')

function RunLog({ sourceId, close }) {
  const S = useStore(s => s.S)
  const source = sourceId ? (S.runs || []).find(r => r.id === sourceId) : null
  const [date, setDate] = useState(source?.d || todayISO())
  const [km, setKm] = useState(source?.km ?? null)
  const [dur, setDur] = useState(source ? fmtDuration(source.sec) : '')
  const [type, setType] = useState(source?.type || 'easy')
  const [rpe, setRpe] = useState(source?.rpe ?? null)
  const [hr, setHr] = useState(source?.hr ?? null)
  const [note, setNote] = useState(source?.note || '')
  const sec = parseDuration(dur)
  const pace = paceOf({ km, sec })

  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) { toast(t('Choose a valid date')); return }
    if (!(km > 0)) { toast(t('Enter the distance')); return }
    if (!sec) { toast(t('Enter the time as 45:30 or 1:02:10')); return }
    const entry = { id: source?.id || uid(), d: date, km, sec, type, rpe, hr, note, _ts: Date.now() }
    update(state => {
      state.runs = (state.runs || []).filter(r => r.id !== entry.id)
      state.runs.push(entry)
    })
    close()
    toast(source ? t('Run updated') : t('Run saved'))
  }

  return <>
    <h3>{source ? t('Edit run') : t('Log a run')}</h3>
    <label className="measure-date">
      <span>{t('Date')}</span>
      <input className="field" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} />
    </label>
    <div className="measure-form">
      <label className="measure-field">
        <span>{t('Distance')}</span>
        <span className="measure-input"><NumberField nullable value={km} onChange={setKm} /><i>km</i></span>
      </label>
      <label className="measure-field">
        <span>{t('Time')}</span>
        <span className="measure-input"><input className="num" inputMode="numeric" placeholder="45:30" value={dur} onChange={e => setDur(e.target.value)} /></span>
      </label>
    </div>
    <div className="small dim run-pace">{t('Pace')} <b>{pace ? fmtPace(pace) + ' /km' : '–'}</b></div>
    <div className="sect-b measure-select"><SelectRow title={t('Type')} sheetTitle={t('Type of run')} value={type} onChange={setType}
      options={RUN_TYPES.map(x => ({ value: x.key, label: t(x.label) }))} /></div>
    <div className="measure-form">
      <label className="measure-field">
        <span>{t('Effort (1–10)')}</span>
        <span className="measure-input"><NumberField nullable decimal={false} value={rpe} onChange={setRpe} /></span>
      </label>
      <label className="measure-field">
        <span>{t('Average heart rate')}</span>
        <span className="measure-input"><NumberField nullable decimal={false} value={hr} onChange={setHr} /><i>bpm</i></span>
      </label>
    </div>
    <div style={{ height: 11 }} />
    <TextField value={note} maxLength={280} placeholder={t('Note (route, feeling…)')} onChange={e => setNote(e.target.value)} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

export function runLogSheet(sourceId = null) {
  return useUI.getState().openSheet(close => <RunLog sourceId={sourceId} close={close} />)
}

function RunGoal({ close }) {
  const S = useStore(s => s.S)
  const [goal, setGoal] = useState(S.runGoalKm ?? 20)
  return <>
    <h3>{t('Weekly goal')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The distance you aim to run each week. Raise it slowly: about 10 % a week at most.')}</div>
    <span className="measure-input"><NumberField value={goal} onChange={setGoal} /><i>km</i></span>
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => { update(s => { s.runGoalKm = goal }); close() }}>{t('Save')}</Button>
  </>
}
const runGoalSheet = () => useUI.getState().openSheet(close => <RunGoal close={close} />)

export default function Running() {
  const S = useStore(s => s.S)
  const [range, setRange] = useState(12)
  const runs = S.runs || []
  const today = todayISO()
  const ws = weekStartOf(S)
  const goal = S.runGoalKm || 20

  const week = useMemo(() => weekTotals(runs, today, ws), [runs, today, ws])
  const series = useMemo(() => weeklySeries(runs, today, range, ws), [runs, today, range, ws])
  const recent = useMemo(() => recentTotals(runs, today, 30), [runs, today])
  const recs = useMemo(() => records(runs), [runs])
  const jump = useMemo(() => loadJump(runs, today, ws), [runs, today, ws])
  const longest = longestRun(runs)
  const points = series.map(w => ({ t: new Date(w.wk + 'T12:00:00').getTime(), y: w.km, d: w.wk }))
  const pct = Math.min(100, Math.round((week.km / goal) * 100))

  const remove = run => confirmSheet({
    title: t('Delete this run?'),
    message: t('Deletes the run of {0}.', fmtDate(run.d, true)),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.runs = s.runs.filter(r => r.id !== run.id) }); toast(t('Run deleted')) },
  })

  return <div className="narrow">
    <div className="hdr">
      <div style={{ flex: 1 }}><h1>{t('Running')}</h1><div className="sub">{t('Distance, pace & consistency')}</div></div>
      <button className="iconbtn" onClick={runGoalSheet} aria-label={t('Weekly goal')}><Icon name="target" /></button>
    </div>

    <div className="card">
      <div className="row between">
        <div>
          <div className="muted small">{t('This week')}</div>
          <div className="big" style={{ marginTop: 3 }}>{fmtNum(week.km)} <span className="muted" style={{ fontSize: '1rem' }}>/ {fmtNum(goal)} km</span></div>
          <div className="small dim" style={{ marginTop: 3 }}>{t(week.n === 1 ? '{0} run' : '{0} runs', week.n)} · {fmtDuration(week.sec)}</div>
        </div>
        <Button size="sm" icon="plus" onClick={() => runLogSheet()}>{t('Log')}</Button>
      </div>
      <div className="run-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: pct + '%' }} /></div>
      {jump != null && <div className="small run-warn">{t('Up {0} % on your last three weeks: keep the next one easier.', Math.round(jump * 100))}</div>}
    </div>

    <div className="run-stats">
      <div className="card"><div className="muted small">{t('This month')}</div><b>{fmtNum(monthKm(runs, today))} km</b></div>
      <div className="card"><div className="muted small">{t('Pace (30 days)')}</div><b>{recent.pace ? fmtPace(recent.pace) : '–'}<span className="dim"> /km</span></b></div>
      <div className="card"><div className="muted small">{t('Longest run')}</div><b>{longest ? fmtNum(longest.km) + ' km' : '–'}</b></div>
    </div>

    <div className="card">
      <div className="muted small" style={{ marginBottom: 8 }}>{t('Distance per week')}</div>
      <Segmented className="seg-range" value={range} onChange={setRange}
        options={[{ value: 4, label: '1M' }, { value: 12, label: '3M' }, { value: 26, label: '6M' }, { value: 52, label: '1Y' }]} />
      <div className="chart"><LineChart points={points} h={160} unit="km" color="var(--teal)" goal={goal} /></div>
    </div>

    <h4 className="sec" style={{ margin: '18px 2px 10px' }}>{t('Best efforts')}</h4>
    <div className="card run-recs">{recs.map(r => <div className="row between" key={r.km}>
      <span>{t(r.label)}</span>
      {r.pace ? <span><b>{fmtDuration(r.time)}</b> <span className="dim small">{fmtPace(r.pace)} /km · {fmtDate(r.run.d)}</span></span> : <span className="dim small">{t('Not yet')}</span>}
    </div>)}</div>

    <h4 className="sec" style={{ margin: '18px 2px 10px' }}>{t('Run history')}</h4>
    {runs.length ? <div className="list">{[...runs].reverse().map(run => <div className="card measure-history" key={run.id}>
      <div className="row between">
        <div>
          <b>{fmtNum(run.km)} km · {fmtDuration(run.sec)}</b>
          <div className="small dim" style={{ marginTop: 2 }}>{fmtDate(run.d, true)} · {typeLabel(run.type)}</div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn" onClick={() => runLogSheet(run.id)} aria-label={t('Edit')}><Icon name="pencil" /></button>
          <button className="iconbtn" style={{ color: 'var(--red)' }} onClick={() => remove(run)} aria-label={t('Delete')}><Icon name="trash" /></button>
        </div>
      </div>
      <div className="measure-preview">
        <span>{t('Pace')} <b>{fmtPace(paceOf(run))} /km</b></span>
        {run.rpe && <span>{t('Effort')} <b>{run.rpe}/10</b></span>}
        {run.hr && <span>{t('HR')} <b>{run.hr} bpm</b></span>}
        {run.note && <span>{run.note}</span>}
      </div>
    </div>)}</div> : <div className="card">
      <div className="muted small">{t('Log your first run: distance and time are enough, the pace is worked out for you.')}</div>
      <div style={{ height: 10 }} /><Button icon="plus" onClick={() => runLogSheet()}>{t('Log a run')}</Button>
    </div>}
  </div>
}
