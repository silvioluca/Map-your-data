import { useState } from 'react'
import { usePlot } from './store'
import { compileColumn, evalColumn, symbolsOf } from './columns'
import { formatPM } from './fit'
import type { Computed } from './types'

/** Finestra per creare o modificare una colonna calcolata. */
export function ComputedDialog({ col, onClose }: { col: Computed | null; onClose: () => void }) {
  const { dispatch, active } = usePlot()
  const sym = symbolsOf(active)
  const [header, setHeader] = useState(col?.header ?? '')
  const [expr, setExpr] = useState(col?.expr ?? '')
  const compiled = compileColumn(active, { id: 0, header, expr })
  const preview = active.rows.slice(0, 3).map((r) => evalColumn(compiled, r))
  const valid = !!expr.trim() && !compiled.error && !!header.trim()

  const save = () => {
    if (!valid) return
    if (col) dispatch({ type: 'UPDATE_COMPUTED', sid: active.id, cid: col.id, patch: { header: header.trim(), expr: expr.trim() } })
    else dispatch({ type: 'ADD_COMPUTED', sid: active.id, header: header.trim(), expr: expr.trim() })
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <form
        className="modal__panel modal__panel--wide"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h3 className="modal__title">{col ? 'Modifica colonna calcolata' : 'Nuova colonna calcolata'}</h3>
        <p className="modal__text">
          Scrivi una formula con i simboli delle colonne: <code>{sym.x}</code> per “{active.headers.x}” e <code>{sym.y}</code> per “{active.headers.y}”. L’errore si
          propaga da {active.headers.ex} e {active.headers.ey}, come se le due misure fossero indipendenti.
        </p>
        <label className="report__field">
          Nome della colonna (con l’unità)
          <input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="es. v (m/s)" autoFocus />
        </label>
        <label className="report__field">
          Formula
          <input className="modal__formula" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder={`es. ${sym.y}/${sym.x}   ·   ${sym.x}^2   ·   2*${sym.y}/${sym.x}^2`} />
        </label>
        <p className="modal__info">
          Operatori + − * / ^ · funzioni sin cos tan sqrt exp ln log abs… · costanti pi, e, g = 9.81
        </p>
        {expr.trim() && (
          <div className={`modal__preview${compiled.error ? ' modal__preview--error' : ''}`}>
            {compiled.error
              ? `Errore: ${compiled.error}`
              : preview.length
                ? `Prime righe: ${preview.map((p) => (Number.isFinite(p.v) ? (p.e > 0 ? formatPM(p.v, p.e) : String(+p.v.toPrecision(6))) : '—')).join('   ·   ')}`
                : 'Formula valida'}
          </div>
        )}
        <div className="modal__actions">
          {col && (
            <button
              type="button"
              className="btn"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                dispatch({ type: 'REMOVE_COMPUTED', sid: active.id, cid: col.id })
                onClose()
              }}
            >
              Elimina
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            {col ? 'Salva' : 'Aggiungi'}
          </button>
        </div>
      </form>
    </div>
  )
}
