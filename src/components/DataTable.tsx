import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { download, parseTable, toCsv } from '../lib/csv'
import { fmt } from '../lib/render2d'
import { NumCell } from './NumCell'
import type { DataPoint } from '../types'

function ImportDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch, points } = useStore()
  const [text, setText] = useState('')
  const kind = state.field.kind
  const { points: parsed, skipped } = parseTable(text, kind)
  const xl = state.mode === 'map' ? 'lon' : 'x'
  const yl = state.mode === 'map' ? 'lat' : 'y'

  const apply = (replace: boolean) => {
    const base = replace ? [] : points.map(({ id: _id, ...r }) => (void _id, r))
    dispatch({ type: 'SET_POINTS', points: [...base, ...parsed] })
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel modal__panel--wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Importa dati</h3>
        <p className="modal__text">
          Incolla le colonne da un foglio di calcolo o carica un file CSV. Ordine delle colonne:{' '}
          <code>{kind === 'scalar' ? `${xl}  ${yl}  valore` : `${xl}  ${yl}  vx  vy`}</code>. Separatori accettati: virgola, punto e virgola, tabulazione.
        </p>
        <textarea
          className="modal__textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'scalar' ? `${xl};${yl};T\n0;0;20,5\n1;0;21,2` : `${xl},${yl},vx,vy\n0,0,1,0.5\n1,0,0.8,0.7`}
          autoFocus
        />
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
            {parsed.length} punti letti{skipped > 0 ? ` · ${skipped} righe ignorate` : ''}
          </span>
        </div>
        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn" disabled={parsed.length === 0 || points.length === 0} onClick={() => apply(false)}>
            Aggiungi
          </button>
          <button className="btn btn--primary" disabled={parsed.length === 0} onClick={() => apply(true)}>
            {points.length ? 'Sostituisci' : 'Importa'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DataTable() {
  const { state, dispatch, points, grid } = useStore()
  const [importing, setImporting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const { field, mode } = state
  const scalar = field.kind === 'scalar'
  const xl = mode === 'map' ? 'lon' : mode === 'plane' ? state.axes.plane.xlabel : state.axes.image.xlabel
  const yl = mode === 'map' ? 'lat' : mode === 'plane' ? state.axes.plane.ylabel : state.axes.image.ylabel
  const name = field.name || (scalar ? 'f' : 'v')
  const unit = field.unit ? ` (${field.unit})` : ''
  const selRow = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    selRow.current?.scrollIntoView({ block: 'nearest' })
  }, [state.selectedId])

  const domain = () => {
    if (mode !== 'map') {
      const a = state.axes[mode]
      return [a.xmin, a.xmax, a.ymin, a.ymax] as const
    }
    // attorno al centro della mappa visibile
    const d = (360 / 2 ** state.map.zoom) * 0.3
    return [state.map.lng - d, state.map.lng + d, state.map.lat - d * 0.6, state.map.lat + d * 0.6] as const
  }

  const addRow = () => {
    const [x0, x1, y0, y1] = domain()
    const last = points[points.length - 1]
    dispatch({
      type: 'ADD_POINT',
      point: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: last?.s ?? 0, u: last?.u ?? 1, v: last?.v ?? 0 },
      select: true,
    })
  }


  const values = points.map((p) => (scalar ? p.s : Math.hypot(p.u, p.v)))
  const vmin = values.length ? Math.min(...values) : NaN
  const vmax = values.length ? Math.max(...values) : NaN
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN

  const upd = (p: DataPoint, patch: Partial<DataPoint>) => dispatch({ type: 'UPDATE_POINT', id: p.id, patch })

  return (
    <div className="data-table-panel">
      <div className="data-table__header">
        <span className="main-graph__title">Dati</span>
        <div className="data-table__actions">
          <button className="graphs__download graphs__download--active" onClick={addRow} title="Aggiungi una riga">
            + Riga
          </button>
          <button className="graphs__download" onClick={() => setImporting(true)} title="Incolla o carica un CSV">
            Importa
          </button>
          <button className="graphs__download" disabled={points.length === 0} onClick={() => download(`map-your-data-${mode}.csv`, toCsv(points, field, mode))}>
            CSV
          </button>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="data-table__empty-wrap">
          <p className="data-table__empty">
            Nessun punto. Clicca {mode === 'map' ? 'sulla mappa' : mode === 'image' ? 'sull’immagine' : 'sul piano'}, aggiungi una riga o importa una tabella.
          </p>
        </div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{xl}</th>
                <th>{yl}</th>
                {scalar ? (
                  <th>
                    {name}
                    {unit}
                  </th>
                ) : (
                  <>
                    <th>
                      {name}x{unit}
                    </th>
                    <th>
                      {name}y{unit}
                    </th>
                    <th>|{name}|</th>
                  </>
                )}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr
                  key={p.id}
                  ref={p.id === state.selectedId ? selRow : undefined}
                  className={p.id === state.selectedId ? 'data-table__row--selected' : p.id === state.hoverId ? 'data-table__row--hover' : undefined}
                  onMouseEnter={() => dispatch({ type: 'HOVER', id: p.id })}
                  onMouseLeave={() => dispatch({ type: 'HOVER', id: null })}
                  onFocus={() => dispatch({ type: 'SELECT', id: p.id })}
                >
                  <td className="data-table__index">{i + 1}</td>
                  <td>
                    <NumCell value={p.x} onCommit={(x) => upd(p, { x })} />
                  </td>
                  <td>
                    <NumCell value={p.y} onCommit={(y) => upd(p, { y })} />
                  </td>
                  {scalar ? (
                    <td>
                      <NumCell value={p.s} onCommit={(s) => upd(p, { s })} />
                    </td>
                  ) : (
                    <>
                      <td>
                        <NumCell value={p.u} onCommit={(u) => upd(p, { u })} />
                      </td>
                      <td>
                        <NumCell value={p.v} onCommit={(v) => upd(p, { v })} />
                      </td>
                      <td className="data-table__derived">{fmt(Math.hypot(p.u, p.v))}</td>
                    </>
                  )}
                  <td>
                    <button className="data-table__delete" title="Elimina questo punto" onClick={() => dispatch({ type: 'REMOVE_POINT', id: p.id })}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {points.length > 0 && (
        <div className="data-table__footer">
          <dl className="stats">
            <div>
              <dt>Punti</dt>
              <dd>{points.length}</dd>
            </div>
            <div>
              <dt>{scalar ? 'Min' : 'Min |v|'}</dt>
              <dd>{fmt(vmin)}</dd>
            </div>
            <div>
              <dt>{scalar ? 'Max' : 'Max |v|'}</dt>
              <dd>{fmt(vmax)}</dd>
            </div>
            <div>
              <dt>Media</dt>
              <dd>{fmt(mean)}</dd>
            </div>
            {grid && (
              <div title="Intervallo del campo interpolato sulla griglia">
                <dt>Griglia</dt>
                <dd>
                  {fmt(grid.zmin)} … {fmt(grid.zmax)}
                </dd>
              </div>
            )}
          </dl>
          {confirmClear ? (
            <span className="data-table__confirm">
              Eliminare tutti i punti?
              <button
                className="graphs__download graphs__download--active"
                onClick={() => {
                  dispatch({ type: 'CLEAR_POINTS' })
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

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  )
}
