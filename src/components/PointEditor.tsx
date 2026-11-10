import { useEffect, useRef, useState } from 'react'
import type { DataPoint, FieldInfo, Mode } from '../types'

export interface EditorTarget {
  /** null = nuovo punto */
  id: number | null
  point: Omit<DataPoint, 'id'>
  /** posizione del popup nello stage (px) */
  sx: number
  sy: number
}

interface Props {
  target: EditorTarget
  field: FieldInfo
  mode: Mode
  stageW: number
  stageH: number
  onSave: (p: Omit<DataPoint, 'id'>) => void
  onDelete: () => void
  onClose: () => void
}

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

const show = (v: number, digits = 6) => String(+v.toPrecision(digits))

export function PointEditor({ target, field, mode, stageW, stageH, onSave, onDelete, onClose }: Props) {
  const p = target.point
  const [x, setX] = useState(show(p.x, mode === 'map' ? 8 : 6))
  const [y, setY] = useState(show(p.y, mode === 'map' ? 8 : 6))
  const [s, setS] = useState(show(p.s))
  const [u, setU] = useState(show(p.u))
  const [v, setV] = useState(show(p.v))
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // dopo il clic: il mousedown sul canvas altrimenti toglie subito il focus
    const t = setTimeout(() => {
      first.current?.focus()
      first.current?.select()
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const vals = { x: num(x), y: num(y), s: num(s), u: num(u), v: num(v) }
  const valid = vals.x !== null && vals.y !== null && (field.kind === 'scalar' ? vals.s !== null : vals.u !== null && vals.v !== null)

  const submit = () => {
    if (!valid) return
    onSave({ x: vals.x!, y: vals.y!, s: vals.s ?? p.s, u: vals.u ?? p.u, v: vals.v ?? p.v })
  }

  // il popup resta dentro lo stage
  const W = 210
  const left = Math.max(6, Math.min(stageW - W - 6, target.sx + 14))
  const top = Math.max(6, Math.min(stageH - 190, target.sy + 14))
  const xl = mode === 'map' ? 'lon' : 'x'
  const yl = mode === 'map' ? 'lat' : 'y'
  const unit = field.unit ? ` (${field.unit})` : ''

  return (
    <form
      className="point-editor"
      style={{ left, top, width: W }}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="point-editor__title">{target.id === null ? 'Nuovo punto' : `Punto #${target.id}`}</div>
      {field.kind === 'scalar' ? (
        <label className="point-editor__row point-editor__row--main">
          <span>
            {field.name || 'f'}
            {unit}
          </span>
          <input ref={first} value={s} onChange={(e) => setS(e.target.value)} inputMode="decimal" />
        </label>
      ) : (
        <>
          <label className="point-editor__row point-editor__row--main">
            <span>
              {field.name || 'v'}x{unit}
            </span>
            <input ref={first} value={u} onChange={(e) => setU(e.target.value)} inputMode="decimal" />
          </label>
          <label className="point-editor__row point-editor__row--main">
            <span>
              {field.name || 'v'}y{unit}
            </span>
            <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" />
          </label>
        </>
      )}
      <div className="point-editor__coords">
        <label className="point-editor__row">
          <span>{xl}</span>
          <input value={x} onChange={(e) => setX(e.target.value)} inputMode="decimal" />
        </label>
        <label className="point-editor__row">
          <span>{yl}</span>
          <input value={y} onChange={(e) => setY(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      <div className="point-editor__actions">
        {target.id !== null && (
          <button type="button" className="graphs__download point-editor__delete" onClick={onDelete}>
            Elimina
          </button>
        )}
        <button type="button" className="graphs__download" onClick={onClose}>
          Annulla
        </button>
        <button type="submit" className="graphs__download graphs__download--active" disabled={!valid}>
          {target.id === null ? 'Aggiungi' : 'OK'}
        </button>
      </div>
    </form>
  )
}
