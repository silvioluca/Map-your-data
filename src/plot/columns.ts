import { compile, ExprError, symbolOf } from '../lib/expr'
import type { Computed, Row, Series } from './types'

/**
 * Colonne calcolate: una formula nei simboli delle colonne x e y (es. "t" e "s"),
 * con l'errore propagato:  σf² = (∂f/∂x · σx)² + (∂f/∂y · σy)²  (derivate numeriche, x e y indipendenti).
 */

export interface ColumnValue {
  v: number
  e: number
}

export interface CompiledColumn {
  id: number
  header: string
  fn: ((x: number, y: number) => number) | null
  error: string | null
}

export function symbolsOf(ser: Series): { x: string; y: string } {
  const x = symbolOf(ser.headers.x, 'x')
  let y = symbolOf(ser.headers.y, 'y')
  if (y === x) y = 'y'
  return { x, y }
}

export function compileColumn(ser: Series, c: Pick<Computed, 'id' | 'header' | 'expr'>): CompiledColumn {
  const sym = symbolsOf(ser)
  try {
    const comp = compile(c.expr)
    const order = [sym.x, sym.y, 'x', 'y']
    const ev = comp.evalWith(order)
    return { id: c.id, header: c.header, fn: (x, y) => ev([x, y, x, y]), error: null }
  } catch (e) {
    return { id: c.id, header: c.header, fn: null, error: e instanceof ExprError ? e.message : 'formula non valida' }
  }
}

/** Valore ed errore propagato di una colonna calcolata per una riga. */
export function evalColumn(col: CompiledColumn, r: Row): ColumnValue {
  if (!col.fn) return { v: NaN, e: NaN }
  const f = col.fn
  const v = f(r.x, r.y)
  const d = (k: 'x' | 'y') => {
    const base = k === 'x' ? r.x : r.y
    const h = 1e-6 * Math.max(Math.abs(base), 1e-6)
    const a = k === 'x' ? f(r.x + h, r.y) : f(r.x, r.y + h)
    const b = k === 'x' ? f(r.x - h, r.y) : f(r.x, r.y - h)
    return (a - b) / (2 * h)
  }
  const ex = r.ex > 0 ? d('x') * r.ex : 0
  const ey = r.ey > 0 ? d('y') * r.ey : 0
  return { v, e: Math.sqrt(ex * ex + ey * ey) }
}

export interface ColumnOption {
  key: string
  label: string
}

export function columnOptions(ser: Series): ColumnOption[] {
  return [
    { key: 'x', label: ser.headers.x },
    { key: 'y', label: ser.headers.y },
    ...ser.computed.map((c) => ({ key: `c${c.id}`, label: c.header || 'senza nome' })),
  ]
}

export interface DisplaySeries {
  /** serie con le righe nelle coordinate del grafico */
  ser: Series
  /** i punti si possono trascinare/aggiungere dal grafico */
  editable: boolean
  xHeader: string
  yHeader: string
}

/** Serie come appare sul grafico, con le colonne scelte per x e y. */
export function displaySeries(ser: Series): DisplaySeries {
  const opts = columnOptions(ser)
  const label = (k: string) => opts.find((o) => o.key === k)?.label ?? k
  const px = ser.kind === 'points' ? ser.plotX : 'x'
  const py = ser.kind === 'points' ? ser.plotY : 'y'
  if (px === 'x' && py === 'y') return { ser, editable: true, xHeader: ser.headers.x, yHeader: ser.headers.y }
  const cols = new Map(ser.computed.map((c) => [`c${c.id}`, compileColumn(ser, c)]))
  const value = (k: string, r: Row): ColumnValue => {
    if (k === 'x') return { v: r.x, e: r.ex }
    if (k === 'y') return { v: r.y, e: r.ey }
    const c = cols.get(k)
    return c ? evalColumn(c, r) : { v: NaN, e: NaN }
  }
  const rows: Row[] = []
  for (const r of ser.rows) {
    const X = value(px, r)
    const Y = value(py, r)
    if (!Number.isFinite(X.v) || !Number.isFinite(Y.v)) continue
    rows.push({ ...r, x: X.v, y: Y.v, ex: Number.isFinite(X.e) ? X.e : 0, ey: Number.isFinite(Y.e) ? Y.e : 0 })
  }
  return { ser: { ...ser, rows }, editable: false, xHeader: label(px), yHeader: label(py) }
}
