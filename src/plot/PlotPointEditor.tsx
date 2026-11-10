import { useEffect, useRef, useState } from 'react'
import type { ColKey, RowInput, Series } from './types'

export interface PlotEditorTarget {
  sid: number
  /** null = nuovo punto */
  rid: number | null
  row: RowInput
  sx: number
  sy: number
}

interface Props {
  target: PlotEditorTarget
  series: Series
  stageW: number
  stageH: number
  onSave: (r: RowInput) => void
  onDelete: () => void
  onClose: () => void
}

const show = (v: number) => String(+v.toPrecision(7))
const num = (s: string) => {
  if (s.trim() === '') return 0
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/** Popup per inserire o modificare un punto (o un vettore) cliccando sul piano. */
export function PlotPointEditor({ target, series, stageW, stageH, onSave, onDelete, onClose }: Props) {
  const keys: ColKey[] = series.kind === 'vectors' ? ['x', 'y', 'vx', 'vy'] : ['x', 'y', 'ex', 'ey']
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const k of keys) o[k] = target.row[k] === 0 && (k === 'ex' || k === 'ey') ? '' : show(target.row[k])
    return o
  })
  // per un punto nuovo il cursore va su y (x è già dove si è cliccato)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      first.current?.focus()
      first.current?.select()
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const parsed = Object.fromEntries(keys.map((k) => [k, num(vals[k])])) as Record<ColKey, number | null>
  const valid = keys.every((k) => parsed[k] !== null)
  const focusKey = series.kind === 'vectors' ? 'vx' : 'y'

  const W = 230
  const left = Math.max(6, Math.min(stageW - W - 6, target.sx + 14))
  const top = Math.max(6, Math.min(stageH - 200, target.sy + 14))

  return (
    <form
      className="point-editor"
      style={{ left, top, width: W }}
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const out = { ...target.row }
        for (const k of keys) out[k] = k === 'ex' || k === 'ey' ? Math.abs(parsed[k]!) : parsed[k]!
        onSave(out)
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="point-editor__title" style={{ color: series.color }}>
        {target.rid === null ? (series.kind === 'vectors' ? 'Nuovo vettore' : 'Nuovo punto') : series.name}
      </div>
      <div className="point-editor__coords">
        {keys.map((k) => (
          <label key={k} className="point-editor__row">
            <span title={series.headers[k]}>{series.headers[k] || k}</span>
            <input
              ref={k === focusKey ? first : undefined}
              value={vals[k]}
              placeholder={k === 'ex' || k === 'ey' ? '—' : ''}
              inputMode="decimal"
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="point-editor__actions">
        {target.rid !== null && (
          <button type="button" className="graphs__download point-editor__delete" onClick={onDelete}>
            Elimina
          </button>
        )}
        <button type="button" className="graphs__download" onClick={onClose}>
          Annulla
        </button>
        <button type="submit" className="graphs__download graphs__download--active" disabled={!valid}>
          {target.rid === null ? 'Aggiungi' : 'OK'}
        </button>
      </div>
    </form>
  )
}
