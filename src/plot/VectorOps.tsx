import { OPS_COLORS, resolveOps, usePlot, type VecRef } from './store'
import { fmt } from '../lib/render2d'
import { angle360 } from '../lib/vec'
import { Vec, VecExpr } from '../components/VecName'

/** Unità tra parentesi nell'intestazione, es. "Fx (N)" → "N". */
const unitOf = (h: string) => h.match(/\(([^)]+)\)/)?.[1] ?? ''
const deg = angle360

function Swatch({ color }: { color: string }) {
  return <span className="vec-ops__swatch" style={{ background: color }} />
}

function VecSelect({ value, options, onChange, label, color }: { value: string; options: VecRef[]; onChange: (k: string) => void; label: string; color: string }) {
  // nel menu (testo semplice) si usa la lettera minuscola
  return (
    <label className="advanced__select vec-ops__select">
      <span>
        <Swatch color={color} /> <Vec>{label}</Vec>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ borderColor: color }}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label} ({fmt(o.row.vx)}, {fmt(o.row.vy)})
          </option>
        ))}
      </select>
    </label>
  )
}

export function VectorOps() {
  const { state, dispatch, active } = usePlot()
  const { all, A, B } = resolveOps(state, active)
  const ops = state.ops

  const header = (
    <div className="data-table__header">
      <span className="main-graph__title">Operazioni sui vettori</span>
    </div>
  )
  if (!A || !B) {
    return (
      <div className="data-table-panel side-panel">
        {header}
        <p className="side-panel__note">Servono almeno due vettori: disegnali sul piano o inseriscili in tabella.</p>
      </div>
    )
  }

  const a = A.row
  const b = B.row
  const u = unitOf(A.ser.headers.vx)
  const ub = unitOf(B.ser.headers.vx)
  const u2 = u ? (ub === u ? ` ${u}²` : ` ${u}·${ub}`) : ''
  const sum = [a.vx + b.vx, a.vy + b.vy]
  const diff = [a.vx - b.vx, a.vy - b.vy]
  const dot = a.vx * b.vx + a.vy * b.vy
  const cross = a.vx * b.vy - a.vy * b.vx
  const ma = Math.hypot(a.vx, a.vy)
  const mb = Math.hypot(b.vx, b.vy)
  const angle = ma > 0 && mb > 0 ? (Math.acos(Math.max(-1, Math.min(1, dot / (ma * mb)))) * 180) / Math.PI : NaN

  const add = (v: number[]) =>
    dispatch({
      type: 'ADD_RESULT',
      row: { x: a.x, y: a.y, vx: +v[0].toPrecision(10), vy: +v[1].toPrecision(10), ex: 0, ey: 0 },
      headers: { x: A.ser.headers.x, y: A.ser.headers.y, vx: A.ser.headers.vx, vy: A.ser.headers.vy },
    })

  const vecRow = (name: string, v: number[], color: string, key: 'sum' | 'diff') => (
    <div className="vec-ops__row" style={{ borderColor: color }}>
      <div className="vec-ops__row-head">
        <span className="vec-ops__name" style={{ color }}>
          <VecExpr expr={name} />
        </span>
        <label className="advanced__toggle vec-ops__show" title="Mostra sul grafico">
          <input type="checkbox" checked={ops[key]} onChange={(e) => dispatch({ type: 'SET_OPS', ops: { [key]: e.target.checked } })} />
          <span>Mostra</span>
        </label>
        <button className="graphs__download" onClick={() => add(v)} title="Aggiungi il risultato alla serie “Risultati”">
          + Risultati
        </button>
      </div>
      <div className="vec-ops__value">
        ({fmt(v[0])}, {fmt(v[1])}){u && ` ${u}`}
      </div>
      <div className="vec-ops__meta">
        modulo {fmt(Math.hypot(v[0], v[1]))} · direzione {fmt(deg(v[0], v[1]), 10)}°
      </div>
    </div>
  )

  return (
    <div className="data-table-panel side-panel">
      {header}
      <div className="vec-ops__pick">
        <VecSelect label="a" color={OPS_COLORS.a} value={A.key} options={all} onChange={(k) => dispatch({ type: 'SET_OPS', ops: { a: k } })} />
        <button className="graphs__download vec-ops__swap" title="Scambia a e b" onClick={() => dispatch({ type: 'SET_OPS', ops: { a: B.key, b: A.key } })}>
          ⇄
        </button>
        <VecSelect label="b" color={OPS_COLORS.b} value={B.key} options={all} onChange={(k) => dispatch({ type: 'SET_OPS', ops: { b: k } })} />
      </div>

      <div className="side-panel__body">
        {vecRow('a + b', sum, OPS_COLORS.sum, 'sum')}
        {vecRow('a − b', diff, OPS_COLORS.diff, 'diff')}

        <div className="vec-ops__row">
          <div className="vec-ops__row-head">
            <span className="vec-ops__name">
              <VecExpr expr="a · b" />
            </span>
            <span className="vec-ops__meta">prodotto scalare</span>
          </div>
          <div className="vec-ops__value">
            {fmt(dot)}
            {u2}
          </div>
        </div>
        <div className="vec-ops__row">
          <div className="vec-ops__row-head">
            <span className="vec-ops__name">
              <VecExpr expr="a × b" />
            </span>
            <span className="vec-ops__meta">prodotto vettoriale</span>
          </div>
          <div className="vec-ops__value">
            (0, 0, {fmt(cross)}){u2}
          </div>
          <div className="vec-ops__meta">perpendicolare al piano, {cross > 0 ? 'uscente (verso chi guarda)' : cross < 0 ? 'entrante' : 'nullo: vettori paralleli'}</div>
        </div>

        <dl className="stats">
          <div>
            <dt>
              |<Vec>a</Vec>|
            </dt>
            <dd>{fmt(ma)}</dd>
          </div>
          <div>
            <dt>
              |<Vec>b</Vec>|
            </dt>
            <dd>{fmt(mb)}</dd>
          </div>
          <div title="Angolo tra a e b">
            <dt>Angolo</dt>
            <dd>{Number.isFinite(angle) ? `${fmt(angle, 10)}°` : '—'}</dd>
          </div>
          <div title="Area del parallelogramma = |a × b|">
            <dt>Area</dt>
            <dd>{fmt(Math.abs(cross))}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
