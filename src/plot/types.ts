import type { Axes } from '../types'
import type { FitConfig } from './fit'

export type SeriesKind = 'points' | 'vectors'

export interface Row {
  id: number
  x: number
  y: number
  /** errori (0 = nessuno) */
  ex: number
  ey: number
  /** componenti del vettore applicato in (x, y) */
  vx: number
  vy: number
}

export type ColKey = 'x' | 'y' | 'ex' | 'ey' | 'vx' | 'vy'

export interface Series {
  id: number
  name: string
  color: string
  kind: SeriesKind
  headers: Record<ColKey, string>
  rows: Row[]
  fit: FitConfig
  visible: boolean
  /** unisce i punti con una spezzata */
  connect: boolean
  /** serie creata dalle operazioni sui vettori */
  role?: 'results'
  /** colonne calcolate con una formula */
  computed: Computed[]
  /** colonne mostrate sugli assi: 'x', 'y' o 'c<id>' */
  plotX: string
  plotY: string
}

export interface Computed {
  id: number
  header: string
  expr: string
}

export interface SnapOptions {
  on: boolean
  /** alle linee della griglia */
  grid: boolean
  /** a code e punte degli altri vettori */
  ends: boolean
}

/** Operazioni sui vettori: chiavi "serie:riga" di A e B, e cosa mostrare sul grafico. */
export interface OpsState {
  a: string
  b: string
  sum: boolean
  diff: boolean
}

export interface PlotAxes extends Axes {
  /** gli assi seguono i dati */
  auto: boolean
  grid: boolean
}

export type RowInput = Omit<Row, 'id'>
