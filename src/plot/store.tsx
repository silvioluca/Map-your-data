import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import type { ColKey, Computed, OpsState, PlotAxes, Row, RowInput, Series, SeriesKind, SnapOptions } from './types'
import { fit, inFitRange, type FitConfig, type FitResult } from './fit'
import { niceStep } from '../lib/render2d'
import { displaySeries, type DisplaySeries } from './columns'

export const PALETTE = ['#d71921', '#1f6feb', '#1a7f37', '#bf8700', '#8250df', '#0a8ea0', '#cf2f98', '#57606a']

/** Colori riservati agli elementi delle operazioni sui vettori. */
export const OPS_COLORS = { a: '#f76707', b: '#7950f2', sum: '#2f9e44', diff: '#1098ad' }

export const DEFAULT_HEADERS: Record<SeriesKind, Record<ColKey, string>> = {
  points: { x: 'x', y: 'y', ex: 'σx', ey: 'σy', vx: 'vx', vy: 'vy' },
  vectors: { x: 'x', y: 'y', ex: 'σx', ey: 'σy', vx: 'Fx', vy: 'Fy' },
}

export interface PlotState {
  series: Series[]
  activeId: number
  nextId: number
  axes: PlotAxes
  showErrors: boolean
  snap: SnapOptions
  ops: OpsState
  selected: { sid: number; rid: number } | null
  hover: { sid: number; rid: number } | null
}

const defaultFit: FitConfig = { model: 'none', degree: 2, expOffset: false, useErrors: true, range: false, xmin: 0, xmax: 1, formula: 'A*exp(-x/tau) + C', p0: {} }

function newSeries(id: number, index: number, kind: SeriesKind = 'points'): Series {
  return {
    id,
    name: `Serie ${index + 1}`,
    color: PALETTE[index % PALETTE.length],
    kind,
    headers: { ...DEFAULT_HEADERS[kind] },
    rows: [],
    fit: { ...defaultFit },
    visible: true,
    connect: false,
    computed: [],
    plotX: 'x',
    plotY: 'y',
  }
}

const initial: PlotState = {
  series: [newSeries(1, 0)],
  activeId: 1,
  nextId: 2,
  axes: { xmin: -1, xmax: 10, ymin: -1, ymax: 10, xlabel: '', ylabel: '', equal: false, auto: true, grid: true },
  showErrors: true,
  snap: { on: true, grid: true, ends: true },
  ops: { a: '', b: '', sum: true, diff: false },
  selected: null,
  hover: null,
}

export type PlotAction =
  | { type: 'ADD_SERIES'; kind?: SeriesKind }
  | { type: 'REMOVE_SERIES'; id: number }
  | { type: 'SET_ACTIVE'; id: number }
  | { type: 'UPDATE_SERIES'; id: number; patch: Partial<Omit<Series, 'id' | 'rows'>> }
  | { type: 'SET_HEADER'; id: number; key: ColKey; value: string }
  | { type: 'ADD_COMPUTED'; sid: number; header: string; expr: string }
  | { type: 'UPDATE_COMPUTED'; sid: number; cid: number; patch: Partial<Omit<Computed, 'id'>> }
  | { type: 'REMOVE_COMPUTED'; sid: number; cid: number }
  | { type: 'SET_PLOT_COLS'; sid: number; plotX?: string; plotY?: string }
  | { type: 'SET_FIT'; id: number; fit: Partial<FitConfig> }
  | { type: 'ADD_ROW'; sid: number; row: RowInput; select?: boolean }
  | { type: 'UPDATE_ROW'; sid: number; rid: number; patch: Partial<RowInput> }
  | { type: 'REMOVE_ROW'; sid: number; rid: number }
  | { type: 'SET_ROWS'; sid: number; rows: RowInput[]; headers?: Partial<Record<ColKey, string>> }
  | { type: 'SET_ALL'; sid: number; key: 'ex' | 'ey'; value: number }
  | { type: 'SET_AXES'; axes: Partial<PlotAxes> }
  | { type: 'SET_SHOW_ERRORS'; value: boolean }
  | { type: 'SET_SNAP'; snap: Partial<SnapOptions> }
  | { type: 'SET_OPS'; ops: Partial<OpsState> }
  | { type: 'ADD_RESULT'; row: RowInput; headers: Partial<Record<ColKey, string>> }
  | { type: 'SELECT'; sel: PlotState['selected'] }
  | { type: 'HOVER'; sel: PlotState['hover'] }

const mapSeries = (s: PlotState, id: number, f: (x: Series) => Series): PlotState => ({ ...s, series: s.series.map((x) => (x.id === id ? f(x) : x)) })

function reducer(s: PlotState, a: PlotAction): PlotState {
  switch (a.type) {
    case 'ADD_SERIES': {
      const ser = newSeries(s.nextId, s.series.length, a.kind)
      return { ...s, series: [...s.series, ser], activeId: ser.id, nextId: s.nextId + 1 }
    }
    case 'REMOVE_SERIES': {
      if (s.series.length <= 1) return mapSeries(s, a.id, (x) => ({ ...x, rows: [] }))
      const series = s.series.filter((x) => x.id !== a.id)
      return { ...s, series, activeId: s.activeId === a.id ? series[0].id : s.activeId, selected: null }
    }
    case 'SET_ACTIVE':
      return { ...s, activeId: a.id }
    case 'UPDATE_SERIES':
      if (a.patch.kind === 'vectors') s = { ...s, axes: { ...s.axes, equal: true } }
      return mapSeries(s, a.id, (x) => {
        const next = { ...x, ...a.patch }
        // cambiando tipo, le intestazioni ancora predefinite seguono il nuovo tipo
        if (a.patch.kind && a.patch.kind !== x.kind) {
          const old = DEFAULT_HEADERS[x.kind]
          const headers = { ...x.headers }
          for (const k of Object.keys(headers) as ColKey[]) if (headers[k] === old[k]) headers[k] = DEFAULT_HEADERS[a.patch.kind][k]
          next.headers = headers
          if (a.patch.kind === 'vectors') next.fit = { ...x.fit, model: 'none' }
        }
        return next
      })
    case 'SET_HEADER':
      return mapSeries(s, a.id, (x) => ({ ...x, headers: { ...x.headers, [a.key]: a.value } }))
    case 'ADD_COMPUTED':
      return { ...mapSeries(s, a.sid, (x) => ({ ...x, computed: [...x.computed, { id: s.nextId, header: a.header, expr: a.expr }] })), nextId: s.nextId + 1 }
    case 'UPDATE_COMPUTED':
      return mapSeries(s, a.sid, (x) => ({ ...x, computed: x.computed.map((c) => (c.id === a.cid ? { ...c, ...a.patch } : c)) }))
    case 'REMOVE_COMPUTED':
      return mapSeries(s, a.sid, (x) => {
        const key = `c${a.cid}`
        return { ...x, computed: x.computed.filter((c) => c.id !== a.cid), plotX: x.plotX === key ? 'x' : x.plotX, plotY: x.plotY === key ? 'y' : x.plotY }
      })
    case 'SET_PLOT_COLS':
      // le colonne sugli assi cambiano: l'intervallo di fit non ha più senso
      return {
        ...mapSeries(s, a.sid, (x) => ({ ...x, plotX: a.plotX ?? x.plotX, plotY: a.plotY ?? x.plotY, fit: a.plotX && a.plotX !== x.plotX ? { ...x.fit, range: false } : x.fit })),
        axes: { ...s.axes, auto: true },
      }
    case 'SET_FIT':
      return mapSeries(s, a.id, (x) => ({ ...x, fit: { ...x.fit, ...a.fit } }))
    case 'ADD_ROW': {
      const row: Row = { ...a.row, id: s.nextId }
      return {
        ...mapSeries(s, a.sid, (x) => ({ ...x, rows: [...x.rows, row] })),
        nextId: s.nextId + 1,
        selected: a.select ? { sid: a.sid, rid: row.id } : s.selected,
      }
    }
    case 'UPDATE_ROW':
      return mapSeries(s, a.sid, (x) => ({ ...x, rows: x.rows.map((r) => (r.id === a.rid ? { ...r, ...a.patch } : r)) }))
    case 'REMOVE_ROW':
      return {
        ...mapSeries(s, a.sid, (x) => ({ ...x, rows: x.rows.filter((r) => r.id !== a.rid) })),
        selected: s.selected?.rid === a.rid ? null : s.selected,
      }
    case 'SET_ROWS': {
      const rows = a.rows.map((r, i) => ({ ...r, id: s.nextId + i }))
      return {
        ...mapSeries(s, a.sid, (x) => ({ ...x, rows, headers: { ...x.headers, ...a.headers } })),
        nextId: s.nextId + rows.length,
        selected: null,
      }
    }
    case 'SET_ALL':
      return mapSeries(s, a.sid, (x) => ({ ...x, rows: x.rows.map((r) => ({ ...r, [a.key]: a.value })) }))
    case 'SET_AXES':
      return { ...s, axes: { ...s.axes, ...a.axes } }
    case 'SET_SHOW_ERRORS':
      return { ...s, showErrors: a.value }
    case 'SET_SNAP':
      return { ...s, snap: { ...s.snap, ...a.snap } }
    case 'SET_OPS':
      return { ...s, ops: { ...s.ops, ...a.ops } }
    case 'ADD_RESULT': {
      // i risultati vanno in una serie a parte, con un colore proprio
      let st = s
      let res = st.series.find((x) => x.role === 'results')
      if (!res) {
        res = { ...newSeries(st.nextId, st.series.length, 'vectors'), name: 'Risultati', color: OPS_COLORS.sum, role: 'results', headers: { ...DEFAULT_HEADERS.vectors, ...a.headers } }
        st = { ...st, series: [...st.series, res], nextId: st.nextId + 1 }
      }
      const row: Row = { ...a.row, id: st.nextId }
      return { ...mapSeries(st, res.id, (x) => ({ ...x, rows: [...x.rows, row] })), nextId: st.nextId + 1 }
    }
    case 'SELECT':
      return { ...s, selected: a.sel }
    case 'HOVER':
      return s.hover?.rid === a.sel?.rid && s.hover?.sid === a.sel?.sid ? s : { ...s, hover: a.sel }
  }
}

const KEY = 'map-your-data-plot'

function load(): PlotState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    const saved = JSON.parse(raw) as Partial<PlotState>
    if (!saved.series?.length) return initial
    return {
      ...initial,
      ...saved,
      series: saved.series.map((x) => ({ ...newSeries(x.id, 0, x.kind), ...x, fit: { ...defaultFit, ...x.fit } })),
      axes: { ...initial.axes, ...saved.axes },
      snap: { ...initial.snap, ...saved.snap },
      ops: { ...initial.ops, ...saved.ops },
      selected: null,
      hover: null,
    }
  } catch {
    return initial
  }
}

/** Assi che contengono tutti i dati visibili (barre d'errore e punte dei vettori comprese). */
export function autoAxes(s: PlotState, shown: Series[] = s.series): Pick<PlotAxes, 'xmin' | 'xmax' | 'ymin' | 'ymax'> | null {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  const take = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  for (const ser of shown) {
    if (!ser.visible) continue
    for (const r of ser.rows) {
      if (ser.kind === 'vectors') {
        take(r.x, r.y)
        take(r.x + r.vx, r.y + r.vy)
      } else {
        const ex = s.showErrors ? Math.abs(r.ex) : 0
        const ey = s.showErrors ? Math.abs(r.ey) : 0
        take(r.x - ex, r.y - ey)
        take(r.x + ex, r.y + ey)
      }
    }
  }
  if (!Number.isFinite(x0)) return null
  const pad = (a: number, b: number): [number, number] => {
    const span = b - a
    if (span <= 0) {
      const d = Math.max(1, Math.abs(a) * 0.2)
      return [a - d, b + d]
    }
    // margine del 5%, poi limiti rotondi
    const step = niceStep(span * 1.1, 10)
    return [Math.floor((a - span * 0.05) / step) * step, Math.ceil((b + span * 0.05) / step) * step]
  }
  const [xmin, xmax] = pad(x0, x1)
  const [ymin, ymax] = pad(y0, y1)
  return { xmin, xmax, ymin, ymax }
}

export interface VecRef {
  key: string
  label: string
  ser: Series
  row: Row
}

/** Vettori disponibili per le operazioni e scelta corrente di A e B. */
export function resolveOps(s: PlotState, active: Series): { all: VecRef[]; A?: VecRef; B?: VecRef } {
  const all = s.series
    .filter((x) => x.kind === 'vectors' && x.role !== 'results')
    .flatMap((x) => x.rows.map((r, i) => ({ key: `${x.id}:${r.id}`, label: `${x.name} #${i + 1}`, ser: x, row: r })))
  const own = all.filter((v) => v.ser.id === active.id)
  const A = all.find((v) => v.key === s.ops.a) ?? own[0] ?? all[0]
  const B = all.find((v) => v.key === s.ops.b && v !== A) ?? own.find((v) => v !== A) ?? all.find((v) => v !== A)
  return { all, A, B }
}

interface Ctx {
  state: PlotState
  dispatch: Dispatch<PlotAction>
  active: Series
  fits: Map<number, FitResult>
  /** serie come appaiono sul grafico (colonne scelte per gli assi) */
  display: Map<number, DisplaySeries>
  activeDisplay: DisplaySeries
  /** assi effettivi (automatici o manuali) */
  view: PlotAxes
}

const PlotContext = createContext<Ctx | null>(null)

export function PlotProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const { selected: _s, hover: _h, ...rest } = state
        void _s
        void _h
        localStorage.setItem(KEY, JSON.stringify(rest))
      } catch {
        /* storage non disponibile */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [state])

  const display = useMemo(() => new Map(state.series.map((s) => [s.id, displaySeries(s)])), [state.series])

  const fits = useMemo(() => {
    const m = new Map<number, FitResult>()
    for (const ser of state.series) {
      const rows = display.get(ser.id)!.ser.rows
      if (ser.kind !== 'points' || ser.fit.model === 'none' || rows.length === 0) continue
      m.set(ser.id, fit(rows.filter((r) => inFitRange(ser.fit, r.x)), ser.fit))
    }
    return m
  }, [state.series, display])

  const active = state.series.find((x) => x.id === state.activeId) ?? state.series[0]
  const activeDisplay = display.get(active.id)!
  const auto = useMemo(() => (state.axes.auto ? autoAxes(state, [...display.values()].map((d) => d.ser)) : null), [state.axes.auto, display, state.showErrors]) // eslint-disable-line react-hooks/exhaustive-deps

  // etichette vuote = nome della colonna della serie attiva
  const view = useMemo<PlotAxes>(
    () => ({
      ...state.axes,
      ...(auto ?? {}),
      xlabel: state.axes.xlabel || activeDisplay.xHeader,
      ylabel: state.axes.ylabel || activeDisplay.yHeader,
    }),
    [state.axes, auto, activeDisplay.xHeader, activeDisplay.yHeader],
  )

  const value = useMemo(() => ({ state, dispatch, active, fits, view, display, activeDisplay }), [state, active, fits, view, display, activeDisplay])
  return <PlotContext.Provider value={value}>{children}</PlotContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlot(): Ctx {
  const c = useContext(PlotContext)
  if (!c) throw new Error('usePlot fuori da PlotProvider')
  return c
}
