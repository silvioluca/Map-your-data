import { useEffect, useRef, useState } from 'react'
import { usePlot } from './store'
import { NumCell } from '../components/NumCell'
import { download } from '../lib/csv'
import { fmt } from '../lib/render2d'
import { angle360 } from '../lib/vec'
import { ComputedDialog } from './ComputedDialog'
import { columnOptions, compileColumn, evalColumn } from './columns'
import { formatPM } from './fit'
import type { Computed } from './types'
import type { ColKey, RowInput, Series, SeriesKind } from './types'

const POINT_COLS: ColKey[] = ['x', 'ex', 'y', 'ey']
const VECTOR_COLS: ColKey[] = ['x', 'y', 'vx', 'vy']
const colsOf = (s: Series) => (s.kind === 'vectors' ? VECTOR_COLS : POINT_COLS)

/** Ordine delle colonne nel CSV/incolla, in base al numero di colonne. */
function importOrder(kind: SeriesKind, n: number): ColKey[] | null {
  if (kind === 'vectors') return n >= 4 ? VECTOR_COLS : null
  if (n === 2) return ['x', 'y']
  if (n === 3) return ['x', 'y', 'ey']
  if (n >= 4) return POINT_COLS
  return null
}

function parsePlotTable(text: string, kind: SeriesKind) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return { rows: [] as RowInput[], headers: {} as Partial<Record<ColKey, string>>, skipped: 0, order: null as ColKey[] | null }
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const cell = (s: string) => s.trim().replace(/^"|"$/g, '')
  const num = (s: string) => {
    const t = cell(s)
    if (t === '') return 0
    const v = parseFloat(sep === ',' ? t : t.replace(',', '.'))
    return Number.isFinite(v) && /^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(t) ? v : null
  }
  const first = lines[0].split(sep)
  const hasHeader = first.some((c) => num(c) === null)
  const ncols = Math.max(...lines.map((l) => l.split(sep).length))
  const order = importOrder(kind, ncols)
  const headers: Partial<Record<ColKey, string>> = {}
  if (hasHeader && order) order.forEach((k, i) => first[i] && cell(first[i]) && (headers[k] = cell(first[i])))
  const rows: RowInput[] = []
  let skipped = 0
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = line.split(sep).map(num)
    if (!order || cells.length < Math.min(order.length, 2) || cells.slice(0, order.length).some((c) => c === null)) {
      skipped++
      continue
    }
    const r: RowInput = { x: 0, y: 0, ex: 0, ey: 0, vx: 0, vy: 0 }
    order.forEach((k, i) => (r[k] = k === 'ex' || k === 'ey' ? Math.abs(cells[i] ?? 0) : (cells[i] ?? 0)))
    rows.push(r)
  }
  return { rows, headers, skipped, order }
}

function ImportDialog({ series, onClose }: { series: Series; onClose: () => void }) {
  const { dispatch } = usePlot()
  const [text, setText] = useState('')
  const { rows, headers, skipped, order } = parsePlotTable(text, series.kind)
  const h = series.headers
  const apply = (replace: boolean) => {
    const base = replace ? [] : series.rows.map(({ id: _id, ...r }) => (void _id, r))
    dispatch({ type: 'SET_ROWS', sid: series.id, rows: [...base, ...rows], headers })
    onClose()
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel modal__panel--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Importa in “{series.name}”</h3>
        <p className="modal__text">
          Incolla le colonne da un foglio di calcolo o carica un CSV. Se la prima riga contiene dei nomi, diventano le intestazioni.
          <br />
          {series.kind === 'vectors' ? (
            <>
              Colonne: <code>{`${h.x}  ${h.y}  ${h.vx}  ${h.vy}`}</code>
            </>
          ) : (
            <>
              2 colonne: <code>{`${h.x} ${h.y}`}</code> · 3: <code>{`${h.x} ${h.y} ${h.ey}`}</code> · 4: <code>{`${h.x} ${h.ex} ${h.y} ${h.ey}`}</code>
            </>
          )}
        </p>
        <textarea className="modal__textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={'t (s);s (m);σs (m)\n0,5;1,2;0,1\n1,0;2,9;0,1'} autoFocus />
        <div className="modal__row">
          <label className="graphs__download">
            Carica file…
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) setText(await f.text())
              }}
            />
          </label>
          <span className="modal__info">
            {rows.length} righe lette{skipped > 0 ? ` · ${skipped} ignorate` : ''}
            {order && rows.length > 0 ? ` · colonne: ${order.map((k) => headers[k] ?? h[k]).join(', ')}` : ''}
          </span>
        </div>
        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn" disabled={!rows.length || !series.rows.length} onClick={() => apply(false)}>
            Aggiungi
          </button>
          <button className="btn btn--primary" disabled={!rows.length} onClick={() => apply(true)}>
            {series.rows.length ? 'Sostituisci' : 'Importa'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Intestazione modificabile. */
function HeaderCell({ value, onChange, title }: { value: string; onChange: (v: string) => void; title: string }) {
  return (
    <th>
      <input className="data-table__header-input" value={value} onChange={(e) => onChange(e.target.value)} title={title} size={Math.max(3, value.length)} />
    </th>
  )
}

/** Imposta lo stesso errore (assoluto o in %) su tutta la colonna. */
function SetAll({ series, k }: { series: Series; k: 'ex' | 'ey' }) {
  const { dispatch } = usePlot()
  const [text, setText] = useState('')
  const apply = () => {
    const t = text.trim().replace(',', '.')
    if (!t) return
    const pct = t.endsWith('%')
    const v = Math.abs(parseFloat(pct ? t.slice(0, -1) : t))
    if (!Number.isFinite(v)) return
    if (!pct) dispatch({ type: 'SET_ALL', sid: series.id, key: k, value: v })
    else {
      const base = k === 'ex' ? 'x' : 'y'
      for (const r of series.rows) dispatch({ type: 'UPDATE_ROW', sid: series.id, rid: r.id, patch: { [k]: +(Math.abs(r[base]) * v / 100).toPrecision(6) } })
    }
    setText('')
  }
  return (
    <label className="control-bar__field" title="Valore assoluto, oppure percentuale (es. 5%)">
      {series.headers[k]} per tutti
      <input type="text" value={text} placeholder="0.1 o 5%" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} style={{ width: 64 }} />
      <button className="graphs__download" onClick={apply} disabled={!text.trim()}>
        OK
      </button>
    </label>
  )
}

export function PlotTable() {
  const { state, dispatch, active } = usePlot()
  const [importing, setImporting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const selRow = useRef<HTMLTableRowElement>(null)
  const cols = colsOf(active)
  const isVec = active.kind === 'vectors'
  const [editCol, setEditCol] = useState<Computed | null | 'new'>(null)
  const computed = isVec ? [] : active.computed.map((c) => compileColumn(active, c))
  const options = columnOptions(active)

  useEffect(() => {
    selRow.current?.scrollIntoView({ block: 'nearest' })
  }, [state.selected])

  const addRow = () => {
    const last = active.rows[active.rows.length - 1]
    const row: RowInput = last ? { ...last, x: last.x + (active.rows.length > 1 ? last.x - active.rows[active.rows.length - 2].x : 1) } : { x: 0, y: 0, ex: 0, ey: 0, vx: 1, vy: 0 }
    const { id: _id, ...clean } = row as RowInput & { id?: number }
    void _id
    dispatch({ type: 'ADD_ROW', sid: active.id, row: clean, select: true })
  }

  const csv = () => {
    const head = cols.map((k) => active.headers[k])
    const lines = active.rows.map((r) => cols.map((k) => r[k]).join(','))
    download(`${active.name.replace(/\W+/g, '_') || 'serie'}.csv`, [head.join(','), ...lines].join('\n'))
  }

  return (
    <div className="data-table-panel">
      <div className="data-table__header">
        <span className="main-graph__title">Dati</span>
        <div className="data-table__actions">
          <button className="graphs__download graphs__download--active" onClick={addRow}>
            + Riga
          </button>
          {!isVec && (
            <button className="graphs__download" onClick={() => setEditCol('new')} title="Colonna calcolata con una formula, con propagazione degli errori">
              + ƒ Colonna
            </button>
          )}
          <button className="graphs__download" onClick={() => setImporting(true)}>
            Importa
          </button>
          <button className="graphs__download" disabled={!active.rows.length} onClick={csv}>
            CSV
          </button>
        </div>
      </div>

      {!isVec && active.computed.length > 0 && (
        <div className="data-table__axes">
          <span className="control-bar__label">Sul grafico</span>
          <label className="control-bar__field">
            x
            <select value={active.plotX} onChange={(e) => dispatch({ type: 'SET_PLOT_COLS', sid: active.id, plotX: e.target.value })}>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="control-bar__field">
            y
            <select value={active.plotY} onChange={(e) => dispatch({ type: 'SET_PLOT_COLS', sid: active.id, plotY: e.target.value })}>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {cols.map((k) => (
                <HeaderCell key={k} value={active.headers[k]} title="Clicca per rinominare la colonna" onChange={(value) => dispatch({ type: 'SET_HEADER', id: active.id, key: k, value })} />
              ))}
              {computed.map((c) => (
                <th key={c.id} className="data-table__computed-head">
                  <button title="Modifica la formula" onClick={() => setEditCol(active.computed.find((q) => q.id === c.id) ?? null)}>
                    {c.header} <span aria-hidden>ƒ</span>
                  </button>
                </th>
              ))}
              {isVec && (
                <>
                  <th className="data-table__derived-head">modulo</th>
                  <th className="data-table__derived-head" title="Direzione da +x in senso antiorario, 0–360°">θ (°)</th>
                </>
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.rows.map((r, i) => {
              const sel = state.selected?.sid === active.id && state.selected.rid === r.id
              const hov = state.hover?.sid === active.id && state.hover.rid === r.id
              return (
                <tr
                  key={r.id}
                  ref={sel ? selRow : undefined}
                  className={sel ? 'data-table__row--selected' : hov ? 'data-table__row--hover' : undefined}
                  onMouseEnter={() => dispatch({ type: 'HOVER', sel: { sid: active.id, rid: r.id } })}
                  onMouseLeave={() => dispatch({ type: 'HOVER', sel: null })}
                  onFocus={() => dispatch({ type: 'SELECT', sel: { sid: active.id, rid: r.id } })}
                >
                  <td className="data-table__index">{i + 1}</td>
                  {cols.map((k) => (
                    <td key={k}>
                      <NumCell
                        value={r[k]}
                        className={k === 'ex' || k === 'ey' ? 'data-table__input--err' : undefined}
                        onCommit={(v) => dispatch({ type: 'UPDATE_ROW', sid: active.id, rid: r.id, patch: { [k]: k === 'ex' || k === 'ey' ? Math.abs(v) : v } })}
                      />
                    </td>
                  ))}
                  {computed.map((c) => {
                    const v = evalColumn(c, r)
                    return (
                      <td key={c.id} className="data-table__computed" title={c.error ?? undefined}>
                        {c.error ? '⚠' : !Number.isFinite(v.v) ? '—' : v.e > 0 ? formatPM(v.v, v.e) : String(+v.v.toPrecision(6))}
                      </td>
                    )
                  })}
                  {isVec && (
                    <>
                      <td className="data-table__derived">{fmt(Math.hypot(r.vx, r.vy))}</td>
                      <td className="data-table__derived">{fmt(angle360(r.vx, r.vy), 10)}</td>
                    </>
                  )}
                  <td>
                    <button className="data-table__delete" title="Elimina la riga" onClick={() => dispatch({ type: 'REMOVE_ROW', sid: active.id, rid: r.id })}>
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {active.rows.length === 0 && (
          <div className="data-table__empty-wrap">
            <p className="data-table__empty">
              Nessun dato in questa serie. {isVec ? 'Trascina sul piano per disegnare un vettore' : 'Clicca sul piano'}, aggiungi una riga o importa una tabella.
            </p>
          </div>
        )}
      </div>

      {active.rows.length > 0 && (
        <div className="data-table__footer">
          {!isVec ? (
            <div className="data-table__setall">
              <SetAll series={active} k="ex" />
              <SetAll series={active} k="ey" />
            </div>
          ) : (
            <span className="modal__info">
              Risultante: {fmt(active.rows.reduce((a, r) => a + r.vx, 0))}, {fmt(active.rows.reduce((a, r) => a + r.vy, 0))} · modulo{' '}
              {fmt(Math.hypot(active.rows.reduce((a, r) => a + r.vx, 0), active.rows.reduce((a, r) => a + r.vy, 0)))}
            </span>
          )}
          {confirmClear ? (
            <span className="data-table__confirm">
              Svuotare la serie?
              <button
                className="graphs__download graphs__download--active"
                onClick={() => {
                  dispatch({ type: 'SET_ROWS', sid: active.id, rows: [] })
                  setConfirmClear(false)
                }}
              >
                Sì
              </button>
              <button className="graphs__download" onClick={() => setConfirmClear(false)}>
                No
              </button>
            </span>
          ) : (
            <button className="graphs__download" onClick={() => setConfirmClear(true)}>
              Svuota
            </button>
          )}
        </div>
      )}

      {importing && <ImportDialog series={active} onClose={() => setImporting(false)} />}
      {editCol && <ComputedDialog col={editCol === 'new' ? null : editCol} onClose={() => setEditCol(null)} />}
    </div>
  )
}
