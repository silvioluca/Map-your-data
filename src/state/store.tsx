import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import type { Axes, DataPoint, FieldInfo, Grid, ImagePlacement, MapView, Mode, ViewOptions } from '../types'
import { computeGrid, type Domain } from '../lib/interpolate'
import { deriveGrid } from '../lib/fieldlines'

export interface State {
  mode: Mode
  field: FieldInfo
  points: Record<Mode, DataPoint[]>
  nextId: number
  axes: { plane: Axes; image: Axes }
  image: { src: string | null; name: string; naturalW: number; naturalH: number; placement: ImagePlacement }
  map: MapView
  opts: ViewOptions
  selectedId: number | null
  hoverId: number | null
}

const DEFAULT_NAMES = {
  scalar: { name: 'T', unit: '°C' },
  vector: { name: 'v', unit: 'm/s' },
} as const

const defaultAxes = (xlabel = 'x', ylabel = 'y'): Axes => ({ xmin: -5, xmax: 5, ymin: -5, ymax: 5, xlabel, ylabel, equal: true })

export const initialState: State = {
  mode: 'plane',
  field: { kind: 'scalar', name: 'T', unit: '°C' },
  points: { plane: [], image: [], map: [] },
  nextId: 1,
  axes: { plane: defaultAxes(), image: { ...defaultAxes(), xmin: 0, xmax: 10, ymin: 0, ymax: 10 } },
  image: { src: null, name: '', naturalW: 0, naturalH: 0, placement: { x: 0, y: 0, w: 10, h: 10, lockAspect: true, opacity: 1 } },
  map: { lat: 41.9, lng: 12.5, zoom: 6 },
  opts: {
    view: 'color',
    quantity: 'value',
    colormap: 'viridis',
    interp: 'tps',
    idwPower: 2,
    resolution: 120,
    levels: 10,
    opacity: 0.75,
    showPoints: true,
    clipHull: false,
    fillContours: false,
    autoRange: true,
    vmin: 0,
    vmax: 1,
  },
  selectedId: null,
  hoverId: null,
}

export type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_FIELD'; field: Partial<FieldInfo> }
  | { type: 'ADD_POINT'; point: Omit<DataPoint, 'id'>; select?: boolean }
  | { type: 'UPDATE_POINT'; id: number; patch: Partial<Omit<DataPoint, 'id'>> }
  | { type: 'REMOVE_POINT'; id: number }
  | { type: 'SET_POINTS'; points: Omit<DataPoint, 'id'>[] }
  | { type: 'CLEAR_POINTS' }
  | { type: 'SET_AXES'; axes: Partial<Axes> }
  | { type: 'SET_IMAGE'; src: string; name: string; naturalW: number; naturalH: number }
  | { type: 'REMOVE_IMAGE' }
  | { type: 'SET_PLACEMENT'; placement: Partial<ImagePlacement> }
  | { type: 'FIT_AXES_TO_IMAGE' }
  | { type: 'SET_MAP'; map: MapView }
  | { type: 'SET_OPTS'; opts: Partial<ViewOptions> }
  | { type: 'SELECT'; id: number | null }
  | { type: 'HOVER'; id: number | null }

function withPoints(s: State, pts: DataPoint[]): State {
  return { ...s, points: { ...s.points, [s.mode]: pts } }
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'SET_MODE':
      return { ...s, mode: a.mode, selectedId: null, hoverId: null }
    case 'SET_FIELD': {
      let field = { ...s.field, ...a.field }
      // se nome e unità sono ancora quelli predefiniti, li adegua al nuovo tipo di campo
      if (a.field.kind && a.field.kind !== s.field.kind) {
        const def = DEFAULT_NAMES[s.field.kind]
        if (s.field.name === def.name && s.field.unit === def.unit) field = { ...field, ...DEFAULT_NAMES[a.field.kind] }
      }
      return { ...s, field }
    }
    case 'ADD_POINT': {
      const p = { ...a.point, id: s.nextId }
      return { ...withPoints(s, [...s.points[s.mode], p]), nextId: s.nextId + 1, selectedId: a.select ? p.id : s.selectedId }
    }
    case 'UPDATE_POINT':
      return withPoints(
        s,
        s.points[s.mode].map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)),
      )
    case 'REMOVE_POINT':
      return { ...withPoints(s, s.points[s.mode].filter((p) => p.id !== a.id)), selectedId: s.selectedId === a.id ? null : s.selectedId }
    case 'SET_POINTS': {
      const pts = a.points.map((p, i) => ({ ...p, id: s.nextId + i }))
      return { ...withPoints(s, pts), nextId: s.nextId + pts.length, selectedId: null }
    }
    case 'CLEAR_POINTS':
      return { ...withPoints(s, []), selectedId: null }
    case 'SET_AXES': {
      if (s.mode === 'map') return s
      const key = s.mode
      return { ...s, axes: { ...s.axes, [key]: { ...s.axes[key], ...a.axes } } }
    }
    case 'SET_IMAGE': {
      // l'immagine occupa tutta la larghezza degli assi, altezza in proporzione
      const ax = s.axes.image
      const w = ax.xmax - ax.xmin
      const h = (w * a.naturalH) / a.naturalW
      const placement = { ...s.image.placement, x: ax.xmin, y: ax.ymin, w, h }
      return {
        ...s,
        image: { src: a.src, name: a.name, naturalW: a.naturalW, naturalH: a.naturalH, placement },
        axes: { ...s.axes, image: { ...ax, ymax: ax.ymin + h } },
      }
    }
    case 'REMOVE_IMAGE':
      return { ...s, image: { ...s.image, src: null, name: '' } }
    case 'SET_PLACEMENT': {
      let pl = { ...s.image.placement, ...a.placement }
      const ratio = s.image.naturalW > 0 ? s.image.naturalH / s.image.naturalW : 1
      if (pl.lockAspect && s.image.naturalW > 0) {
        if (a.placement.w !== undefined && a.placement.h === undefined) pl = { ...pl, h: pl.w * ratio }
        else if (a.placement.h !== undefined && a.placement.w === undefined) pl = { ...pl, w: pl.h / ratio }
        else if (a.placement.lockAspect) pl = { ...pl, h: pl.w * ratio }
      }
      return { ...s, image: { ...s.image, placement: pl } }
    }
    case 'FIT_AXES_TO_IMAGE': {
      const p = s.image.placement
      return { ...s, axes: { ...s.axes, image: { ...s.axes.image, xmin: p.x, xmax: p.x + p.w, ymin: p.y, ymax: p.y + p.h } } }
    }
    case 'SET_MAP':
      return { ...s, map: a.map }
    case 'SET_OPTS':
      return { ...s, opts: { ...s.opts, ...a.opts } }
    case 'SELECT':
      return { ...s, selectedId: a.id }
    case 'HOVER':
      return s.hoverId === a.id ? s : { ...s, hoverId: a.id }
  }
}

const STORAGE_KEY = 'map-your-data-state'

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const saved = JSON.parse(raw) as Partial<State>
    return {
      ...initialState,
      ...saved,
      field: { ...initialState.field, ...saved.field },
      points: { ...initialState.points, ...saved.points },
      axes: { plane: { ...initialState.axes.plane, ...saved.axes?.plane }, image: { ...initialState.axes.image, ...saved.axes?.image } },
      image: { ...initialState.image, ...saved.image, placement: { ...initialState.image.placement, ...saved.image?.placement } },
      opts: { ...initialState.opts, ...saved.opts },
      selectedId: null,
      hoverId: null,
    }
  } catch {
    return initialState
  }
}

function save(s: State) {
  const { selectedId: _a, hoverId: _b, ...rest } = s
  void _a
  void _b
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // immagine troppo grande per il localStorage: si salva tutto il resto
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, image: { ...rest.image, src: null } }))
    } catch {
      /* storage non disponibile */
    }
  }
}

/** Dominio di interpolazione della modalità corrente. */
export function domainOf(s: State): Domain | null {
  if (s.mode !== 'map') {
    const a = s.axes[s.mode]
    return { x0: a.xmin, x1: a.xmax, y0: a.ymin, y1: a.ymax }
  }
  const pts = s.points.map
  if (pts.length === 0) return null
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
  }
  // margine del 15% (minimo ~1 km) attorno ai punti
  const padX = Math.max((x1 - x0) * 0.15, 0.01)
  const padY = Math.max((y1 - y0) * 0.15, 0.01)
  return { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY }
}

export function kxOf(s: State): number {
  if (s.mode !== 'map') return 1
  const pts = s.points.map
  const lat = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : s.map.lat
  return Math.cos((lat * Math.PI) / 180)
}

interface Ctx {
  state: State
  dispatch: Dispatch<Action>
  points: DataPoint[]
  grid: Grid | null
}

const StoreContext = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    const t = setTimeout(() => save(state), 300)
    return () => clearTimeout(t)
  }, [state])

  const points = state.points[state.mode]
  const domain = useMemo(() => domainOf(state), [state.mode, state.axes, state.points.map]) // eslint-disable-line react-hooks/exhaustive-deps
  const kx = kxOf(state)
  const { kind } = state.field
  const { interp, idwPower, resolution, clipHull } = state.opts

  const baseGrid = useMemo(() => {
    if (!domain || points.length === 0) return null
    return computeGrid({ points, kind, method: interp, idwPower, domain, resolution, kx, clipHull })
  }, [points, kind, interp, idwPower, domain, resolution, kx, clipHull])

  // divergenza, rotore, |∇f|, ∇²f: solo se adatti al tipo di campo
  const q = state.opts.quantity
  const validQ = kind === 'vector' ? q === 'div' || q === 'curl' : q === 'gradmag' || q === 'laplacian'
  const grid = useMemo(() => (baseGrid && validQ ? deriveGrid(baseGrid, q) : baseGrid), [baseGrid, q, validQ])

  const value = useMemo(() => ({ state, dispatch, points, grid }), [state, points, grid])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Ctx {
  const c = useContext(StoreContext)
  if (!c) throw new Error('useStore fuori da StoreProvider')
  return c
}
