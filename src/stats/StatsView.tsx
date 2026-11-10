import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseNumbers, useStats } from './store'
import { autoBins, histogram, histogramByWidth, integerData } from './stats'
import { chi2Test, DIST_INFO, DIST_ORDER, fitDist, type Chi2Test, type DistName, type FittedDist } from './distributions'
import { NumCell } from '../components/NumCell'
import { NumField } from '../components/NumField'
import { Segmented } from '../components/Segmented'
import { setupCanvas, useSize } from '../lib/useSize'
import { drawAxes, planeProjector, readTheme } from '../lib/render2d'
import { download } from '../lib/csv'
import { fmt } from '../lib/render2d'

/** 5 cifre significative, senza zeri inutili. */
const p5 = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(5)) : '—')
import { formatPM } from '../plot/fit'
import type { Axes } from '../types'
import { useThemeKey } from '../lib/useThemeKey'

function StatsToolbar({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { state, dispatch, active } = useStats()
  return (
    <div className="control-bar">
      {modeSwitch}
      <div className="control-bar__group">
        <span className="control-bar__label">Misure</span>
        <span className="series-picker">
          <span className="object-chip__dot" style={{ background: active.color }} />
          <select value={active.id} onChange={(e) => dispatch({ type: 'SET_ACTIVE', id: +e.target.value })} title="Gruppo di misure">
            {state.sets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || 'senza nome'} ({d.values.length})
              </option>
            ))}
          </select>
        </span>
        <button className="graphs__download icon-btn" onClick={() => dispatch({ type: 'ADD_SET' })} title="Nuovo gruppo di misure">
          +
        </button>
        <button className="graphs__download icon-btn" disabled={state.sets.length <= 1} onClick={() => dispatch({ type: 'REMOVE_SET', id: active.id })} title="Elimina il gruppo">
          ✕
        </button>
      </div>
      <div className="control-bar__group">
        <span className="control-bar__label">Aspetto</span>
        <label className="control-bar__field">
          grandezza
          <input type="text" value={active.name} onChange={(e) => dispatch({ type: 'UPDATE_SET', id: active.id, patch: { name: e.target.value } })} style={{ width: 96 }} />
        </label>
        <label className="control-bar__field">
          unità
          <input type="text" value={active.unit} onChange={(e) => dispatch({ type: 'UPDATE_SET', id: active.id, patch: { unit: e.target.value } })} style={{ width: 56 }} />
        </label>
        <label className="control-bar__field" title="Colore">
          colore
          <input type="color" className="color-input" value={active.color} onChange={(e) => dispatch({ type: 'UPDATE_SET', id: active.id, patch: { color: e.target.value } })} />
        </label>
      </div>
      <details className="advanced">
        <summary>Impostazioni avanzate</summary>
        <div className="advanced__body">
          <fieldset className="advanced__section">
            <legend>Istogramma</legend>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.relative} onChange={(e) => dispatch({ type: 'SET_OPTS', opts: { relative: e.target.checked } })} />
              <span>Frequenze relative (al posto dei conteggi)</span>
            </label>
          </fieldset>
          <fieldset className="advanced__section">
            <legend>Strumento</legend>
            <label className="control-bar__field">
              sensibilità
              <NumField value={state.sensitivity} onChange={(v) => dispatch({ type: 'SET_OPTS', opts: { sensitivity: Math.abs(v) } })} width={70} />
              {active.unit}
            </label>
            <small>Se l’errore statistico è più piccolo della sensibilità, come incertezza si usa la sensibilità.</small>
          </fieldset>
        </div>
      </details>
    </div>
  )
}

/** Istogramma secondo la modalità delle classi scelta. */
function useHistogram() {
  const { state, active } = useStats()
  const values = useMemo(() => active.values.map((m) => m.v), [active.values])
  const hist = useMemo(() => {
    if (state.binMode === 'width') return histogramByWidth(values, state.binWidth, state.binStart)
    if (state.binMode === 'count') return histogram(values, state.bins)
    // automatiche: una classe per intero se i dati sono conteggi, altrimenti Sturges
    if (integerData(values)) return histogramByWidth(values, 1, Math.min(...values) - 0.5)
    return histogram(values, autoBins(values.length))
  }, [values, state.binMode, state.bins, state.binWidth, state.binStart])
  return { values, hist }
}

/** Distribuzioni scelte, con parametri stimati e test del χ². */
function useDists() {
  const { state, summary } = useStats()
  const { values, hist } = useHistogram()
  return useMemo(() => {
    if (!summary || !hist) return []
    return state.dists
      .map((name) => {
        const d = fitDist(name, values, summary)
        if (!d) return null
        return { d, test: d.warning && d.params.length === 0 ? null : chi2Test(d, hist, summary.n) }
      })
      .filter((x): x is { d: FittedDist; test: Chi2Test | null } => !!x)
  }, [state.dists, values, hist, summary])
}

function Histogram({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const { state, active, summary } = useStats()
  const wrap = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrap)
  const { hist } = useHistogram()
  const dists = useDists()
  const themeKey = useThemeKey()

  useEffect(() => {
    const c = canvasRef.current
    if (!c || w === 0 || h === 0) return
    const ctx = setupCanvas(c, w, h)
    const theme = readTheme()
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)
    const label = `${active.name || 'x'}${active.unit ? ` (${active.unit})` : ''}`
    const ylabel = state.relative ? 'frequenza relativa' : 'conteggi'
    if (!hist || !summary) {
      const ax: Axes = { xmin: 0, xmax: 10, ymin: 0, ymax: 5, xlabel: label, ylabel, equal: false }
      const { proj, rect } = planeProjector(ax, w, h)
      drawAxes(ctx, ax, proj, rect, theme, true)
      ctx.font = '13px ui-monospace, Consolas, monospace'
      ctx.fillStyle = theme.textH
      ctx.textAlign = 'center'
      ctx.fillText('Inserisci le misure nella tabella a destra', rect.left + rect.width / 2, rect.top + 30)
      return
    }
    const N = summary.n
    const scale = state.relative ? 1 / N : 1
    const sd = summary.sd
    // asse x: le classi, più le code della gaussiana se è mostrata
    let lo = hist.edges[0]
    let hi = hist.edges[hist.edges.length - 1]
    if (state.dists.includes('gauss') && sd > 0) {
      lo = Math.min(lo, summary.mean - 3.5 * sd)
      hi = Math.max(hi, summary.mean + 3.5 * sd)
    }
    const pad = (hi - lo) * 0.04
    const xmin = lo - pad
    const xmax = hi + pad
    // curve continue campionate (conteggi attesi per unità di classe = N·larghezza·densità)
    const curves = dists.map(({ d, test }) => {
      const info = DIST_INFO[d.name]
      const pts: [number, number][] = []
      if (!info.discrete) for (let i = 0; i <= 400; i++) {
        const x = xmin + ((xmax - xmin) * i) / 400
        pts.push([x, N * hist.width * d.density(x) * scale])
      }
      return { d, info, pts, expected: test?.expected.map((e) => e * scale) ?? [] }
    })
    let ymax = Math.max(...hist.counts) * scale
    for (const cv of curves) {
      for (const p of cv.pts) if (Number.isFinite(p[1])) ymax = Math.max(ymax, p[1])
      for (const e of cv.expected) ymax = Math.max(ymax, e)
    }
    const ax: Axes = { xmin, xmax, ymin: 0, ymax: ymax * 1.18 || 1, xlabel: label, ylabel, equal: false }
    const { proj, rect } = planeProjector(ax, w, h)
    drawAxes(ctx, ax, proj, rect, theme, true, !state.relative)
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.left, rect.top, rect.width, rect.height)
    ctx.clip()
    // barre
    hist.counts.forEach((cnt, i) => {
      const [x0, y0] = proj.toScreen(hist.edges[i], cnt * scale)
      const [x1, y1] = proj.toScreen(hist.edges[i + 1], 0)
      ctx.fillStyle = active.color
      ctx.globalAlpha = 0.4
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      ctx.globalAlpha = 1
      ctx.strokeStyle = active.color
      ctx.lineWidth = 1.5
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0)
      if (cnt > 0) {
        ctx.fillStyle = theme.textH
        ctx.font = '12px ui-monospace, Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(state.relative ? (cnt / N).toFixed(2) : String(cnt), (x0 + x1) / 2, y0 - 6)
      }
    })
    // distribuzioni: curva (continue) e conteggi attesi per classe (pallini)
    for (const cv of curves) {
      const col = cv.info.color === '#1f1f1f' ? theme.textH : cv.info.color
      ctx.strokeStyle = col
      ctx.fillStyle = col
      if (cv.pts.length) {
        ctx.lineWidth = 2
        ctx.beginPath()
        cv.pts.forEach(([x, y], i) => {
          const [px, py] = proj.toScreen(x, y)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.stroke()
      }
      if (cv.info.discrete) {
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        cv.expected.forEach((e, i) => {
          const [px, py] = proj.toScreen((hist.edges[i] + hist.edges[i + 1]) / 2, e)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.stroke()
        ctx.setLineDash([])
      }
      cv.expected.forEach((e, i) => {
        const [px, py] = proj.toScreen((hist.edges[i] + hist.edges[i + 1]) / 2, e)
        ctx.beginPath()
        ctx.arc(px, py, cv.info.discrete ? 4.5 : 3, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    // media e ±σ
    const vline = (x: number, dash: number[], text: string) => {
      const [px] = proj.toScreen(x, 0)
      ctx.save()
      ctx.strokeStyle = theme.accent
      ctx.lineWidth = 1.6
      ctx.setLineDash(dash)
      ctx.beginPath()
      ctx.moveTo(px, rect.top)
      ctx.lineTo(px, rect.top + rect.height)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = 'bold 12px ui-monospace, Consolas, monospace'
      const tw = ctx.measureText(text).width + 8
      ctx.fillStyle = theme.bg
      ctx.fillRect(px - tw / 2, rect.top + 4, tw, 18)
      ctx.fillStyle = theme.accent
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, px, rect.top + 13)
      ctx.restore()
    }
    vline(summary.mean, [], 'x̄')
    if (Number.isFinite(sd) && sd > 0) {
      vline(summary.mean - sd, [5, 4], 'x̄−σ')
      vline(summary.mean + sd, [5, 4], 'x̄+σ')
    }
    ctx.restore()
    // legenda delle distribuzioni
    if (curves.length) {
      ctx.save()
      ctx.font = '12px ui-monospace, Consolas, monospace'
      const lw = Math.max(...curves.map((c) => ctx.measureText(c.info.label).width)) + 44
      const lx = rect.left + rect.width - lw - 10
      const ly = rect.top + 30
      ctx.fillStyle = theme.bg
      ctx.globalAlpha = 0.9
      ctx.fillRect(lx, ly, lw, curves.length * 20 + 8)
      ctx.globalAlpha = 1
      ctx.strokeStyle = theme.border
      ctx.strokeRect(lx + 0.5, ly + 0.5, lw, curves.length * 20 + 8)
      curves.forEach((cv, i) => {
        const y = ly + 14 + i * 20
        const col = cv.info.color === '#1f1f1f' ? theme.textH : cv.info.color
        ctx.strokeStyle = col
        ctx.fillStyle = col
        ctx.lineWidth = 2
        ctx.setLineDash(cv.info.discrete ? [4, 3] : [])
        ctx.beginPath()
        ctx.moveTo(lx + 8, y)
        ctx.lineTo(lx + 30, y)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(lx + 19, y, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = theme.textH
        ctx.textBaseline = 'middle'
        ctx.fillText(cv.info.label, lx + 36, y)
      })
      ctx.restore()
    }
  }, [w, h, hist, dists, summary, state.dists, state.relative, active.color, active.name, active.unit, themeKey, canvasRef])

  return (
    <div className="stage__canvas-wrap" ref={wrap}>
      <canvas ref={canvasRef} className="stage__canvas" />
    </div>
  )
}

/** Confronto con le distribuzioni: scelta, parametri stimati e test del χ². */
function DistPanel() {
  const { state, dispatch, summary } = useStats()
  const dists = useDists()
  const toggle = (n: DistName, on: boolean) =>
    dispatch({ type: 'SET_OPTS', opts: { dists: on ? DIST_ORDER.filter((d) => d === n || state.dists.includes(d)) : state.dists.filter((d) => d !== n) } })
  return (
    <div className="data-table-panel side-panel">
      <div className="data-table__header">
        <span className="main-graph__title">Distribuzioni</span>
      </div>
      <div className="side-panel__body">
        {DIST_ORDER.map((n) => {
          const info = DIST_INFO[n]
          const on = state.dists.includes(n)
          const r = dists.find((x) => x.d.name === n)
          return (
            <div key={n} className={`dist-row${on ? ' dist-row--on' : ''}`} style={{ borderColor: on ? (info.color === '#1f1f1f' ? 'var(--text-h)' : info.color) : undefined }}>
              <label className="advanced__toggle dist-row__head">
                <input type="checkbox" checked={on} onChange={(e) => toggle(n, e.target.checked)} />
                <span>
                  {info.label}
                  <small>{info.hint}</small>
                </span>
              </label>
              {on && summary && !r && <p className="dist-row__warn">Servono più misure, non tutte uguali.</p>}
              {on && r && (
                <>
                  {r.d.warning && <p className="dist-row__warn">Attenzione: {r.d.warning}.</p>}
                  {r.d.params.length > 0 && (
                    <div className="dist-row__params">
                      {r.d.params.map((p) => (
                        <span key={p.name}>
                          {p.name} = <b>{+p.value.toPrecision(4)}</b>
                        </span>
                      ))}
                    </div>
                  )}
                  {r.test && r.test.dof > 0 ? (
                    <div className="dist-row__test">
                      <span>
                        χ² = {r.test.chi2.toPrecision(3)} · ν = {r.test.dof} · χ²/ν = {(r.test.chi2 / r.test.dof).toPrecision(2)}
                      </span>
                      <span className={r.test.p >= 0.05 ? 'dist-row__ok' : 'dist-row__no'}>
                        p = {r.test.p < 0.001 ? '< 0.001' : r.test.p.toPrecision(2)} · {r.test.p >= 0.05 ? 'compatibile' : 'non compatibile'} (al 5%)
                      </span>
                      {r.test.lowCounts && <small>Alcune classi hanno meno di 5 conteggi attesi: il test è solo indicativo.</small>}
                    </div>
                  ) : (
                    r.test && <small className="dist-row__hint">Per il test del χ² servono più classi (ν = classi − 1 − parametri).</small>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MeasuresTable() {
  const { dispatch, active } = useStats()
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState(false)
  const add = () => {
    const vals = parseNumbers(text)
    if (vals.length) dispatch({ type: 'ADD_VALUES', id: active.id, values: vals })
    setText('')
  }
  const head = `${active.name || 'x'}${active.unit ? ` (${active.unit})` : ''}`
  return (
    <div className="data-table-panel">
      <div className="data-table__header">
        <span className="main-graph__title">Dati</span>
        <div className="data-table__actions">
          <button className="graphs__download" disabled={!active.values.length} onClick={() => download(`${active.name || 'misure'}.csv`, [head, ...active.values.map((m) => m.v)].join('\n'))}>
            CSV
          </button>
        </div>
      </div>
      <div className="stats-input">
        <textarea
          value={text}
          rows={1}
          placeholder="Misura + Invio, o incolla una colonna"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              add()
            }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text')
            if (/[\s;]/.test(t.trim())) {
              e.preventDefault()
              const vals = parseNumbers(t)
              if (vals.length) dispatch({ type: 'ADD_VALUES', id: active.id, values: vals })
            }
          }}
        />
        <button className="graphs__download graphs__download--active" onClick={add} disabled={!parseNumbers(text).length}>
          Aggiungi
        </button>
      </div>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{head}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.values.map((m, i) => (
              <tr key={m.id}>
                <td className="data-table__index">{i + 1}</td>
                <td>
                  <NumCell value={m.v} onCommit={(v) => dispatch({ type: 'UPDATE_VALUE', id: active.id, mid: m.id, v })} />
                </td>
                <td>
                  <button className="data-table__delete" title="Elimina la misura" onClick={() => dispatch({ type: 'REMOVE_VALUE', id: active.id, mid: m.id })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {active.values.length === 0 && (
          <div className="data-table__empty-wrap">
            <p className="data-table__empty">Nessuna misura. Scrivila sopra e premi Invio, o incolla una colonna da un foglio di calcolo.</p>
          </div>
        )}
      </div>
      {active.values.length > 0 && (
        <div className="data-table__footer">
          <span className="modal__info">{active.values.length} misure</span>
          {confirm ? (
            <span className="data-table__confirm">
              Svuotare?
              <button
                className="graphs__download graphs__download--active"
                onClick={() => {
                  dispatch({ type: 'CLEAR', id: active.id })
                  setConfirm(false)
                }}
              >
                Sì
              </button>
              <button className="graphs__download" onClick={() => setConfirm(false)}>
                No
              </button>
            </span>
          ) : (
            <button className="graphs__download" onClick={() => setConfirm(true)}>
              Svuota
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ResultsPanel() {
  const { state, active, summary } = useStats()
  const u = active.unit ? ` ${active.unit}` : ''
  const name = active.name || 'x'
  const header = (
    <div className="data-table__header">
      <span className="main-graph__title">Risultato</span>
    </div>
  )
  if (!summary)
    return (
      <div className="data-table-panel side-panel">
        {header}
        <p className="side-panel__note">Servono almeno due misure.</p>
      </div>
    )
  const sens = state.sensitivity
  const statErr = summary.sem
  const useSens = sens > 0 && (!Number.isFinite(statErr) || statErr < sens)
  const err = useSens ? sens : statErr
  return (
    <div className="data-table-panel side-panel">
      {header}
      <div className="side-panel__body">
        <div className="stats-result">
          <span className="stats-result__name">{name} =</span> {Number.isFinite(err) ? formatPM(summary.mean, err) : fmt(summary.mean)}
          {u}
        </div>
        <p className="side-panel__note" style={{ padding: 0 }}>
          {useSens
            ? 'Incertezza = sensibilità dello strumento (più grande dell’errore statistico).'
            : 'Valore medio ± errore standard della media (σ/√N).'}
        </p>
        <table className="fit-panel__params">
          <tbody>
            <tr>
              <th>N</th>
              <td>{summary.n}</td>
            </tr>
            <tr>
              <th>media x̄</th>
              <td>
                {p5(summary.mean)}
                {u}
              </td>
            </tr>
            <tr>
              <th title="Deviazione standard campionaria, con N − 1">dev. std σ</th>
              <td>
                {p5(summary.sd)}
                {u}
              </td>
            </tr>
            <tr>
              <th>σ/√N</th>
              <td>
                {p5(summary.sem)}
                {u}
              </td>
            </tr>
            <tr>
              <th title="(max − min)/2">semidispersione</th>
              <td>
                {p5(summary.halfRange)}
                {u}
              </td>
            </tr>
            <tr>
              <th>mediana</th>
              <td>
                {p5(summary.median)}
                {u}
              </td>
            </tr>
            <tr>
              <th>min … max</th>
              <td>
                {p5(summary.min)} … {p5(summary.max)}
                {u}
              </td>
            </tr>
            {Number.isFinite(summary.sd) && summary.mean !== 0 && (
              <tr>
                <th title="σ/|x̄|">errore relativo</th>
                <td>{((Math.abs(err) / Math.abs(summary.mean)) * 100).toPrecision(2)} %</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StatsView({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { state, dispatch } = useStats()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { hist } = useHistogram()
  const exportPng = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'istogramma.png'
    a.click()
  }
  return (
    <>
      <StatsToolbar modeSwitch={modeSwitch} />
      <main className="app__main">
        <div className="stage">
          <div className="main-graph__header">
            <span className="main-graph__title">Istogramma</span>
            <div className="main-graph__header-controls">
              <button className="graphs__download" onClick={exportPng} title="Scarica l’istogramma come immagine">
                PNG
              </button>
            </div>
          </div>
          <div className="stage__body">
            <div className="stage__view">
              <Histogram canvasRef={canvasRef} />
            </div>
          </div>
          <p className="stage__help">Linea piena: media x̄ · tratteggiate: x̄ ± σ · curve e pallini: distribuzioni scelte e conteggi attesi per classe</p>
          <div className="stage__settings">
            <div className="stage__settings-group">
              <span className="control-bar__label">Classi</span>
              <Segmented<'auto' | 'count' | 'width'>
                name="bins-mode"
                value={state.binMode}
                onChange={(m) => {
                  // si parte dalle classi che si vedono adesso
                  if (m === 'count') dispatch({ type: 'SET_OPTS', opts: { binMode: m, bins: hist?.counts.length ?? 6 } })
                  else if (m === 'width') dispatch({ type: 'SET_OPTS', opts: { binMode: m, binWidth: hist ? +hist.width.toPrecision(2) : 1, binStart: NaN } })
                  else dispatch({ type: 'SET_OPTS', opts: { binMode: m } })
                }}
                options={[
                  { value: 'auto', label: 'Automatiche', title: 'Regola di Sturges (1 + log₂ N); per dati interi una classe per valore' },
                  { value: 'count', label: 'Numero', title: 'Scegli quante classi' },
                  { value: 'width', label: 'Larghezza', title: 'Scegli larghezza e inizio delle classi' },
                ]}
              />
              {state.binMode === 'count' && (
                <span className="stepper">
                  <button className="graphs__download" disabled={state.bins <= 1} onClick={() => dispatch({ type: 'SET_OPTS', opts: { bins: Math.max(1, state.bins - 1) } })}>
                    −
                  </button>
                  <b>{state.bins}</b>
                  <button className="graphs__download" disabled={state.bins >= 50} onClick={() => dispatch({ type: 'SET_OPTS', opts: { bins: Math.min(50, state.bins + 1) } })}>
                    +
                  </button>
                </span>
              )}
              {state.binMode === 'width' && (
                <>
                  <label className="control-bar__field">
                    larghezza
                    <NumField value={state.binWidth} onChange={(v) => v > 0 && dispatch({ type: 'SET_OPTS', opts: { binWidth: v } })} width={70} />
                  </label>
                  <label className="control-bar__field" title="Bordo sinistro della prima classe">
                    inizio
                    <NumField value={state.binStart} onChange={(v) => dispatch({ type: 'SET_OPTS', opts: { binStart: v } })} width={70} />
                  </label>
                  {Number.isFinite(state.binStart) && (
                    <button className="graphs__download" onClick={() => dispatch({ type: 'SET_OPTS', opts: { binStart: NaN } })} title="Inizio automatico">
                      auto
                    </button>
                  )}
                </>
              )}
              {hist && (
                <span className="fit-panel__hint">
                  {hist.counts.length} classi · larghezza {+hist.width.toPrecision(3)} · da {+hist.edges[0].toPrecision(4)} a {+hist.edges[hist.edges.length - 1].toPrecision(4)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="app__side">
          <MeasuresTable />
          <ResultsPanel />
          <DistPanel />
        </div>
      </main>
    </>
  )
}
