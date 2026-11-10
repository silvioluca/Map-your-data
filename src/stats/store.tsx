import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { summarize, type Summary } from './stats'
import type { DistName } from './distributions'

export interface Measure {
  id: number
  v: number
}

export interface Dataset {
  id: number
  name: string
  unit: string
  color: string
  values: Measure[]
}

export interface StatsState {
  sets: Dataset[]
  activeId: number
  nextId: number
  /** classi: automatiche, numero fissato o larghezza fissata */
  binMode: 'auto' | 'count' | 'width'
  /** numero di classi (modo 'count') */
  bins: number
  /** larghezza e inizio della prima classe (modo 'width'; inizio NaN = automatico) */
  binWidth: number
  binStart: number
  /** distribuzioni sovrapposte all'istogramma */
  dists: DistName[]
  relative: boolean
  /** sensibilità dello strumento (0 = non indicata) */
  sensitivity: number
}

const COLORS = ['#1f6feb', '#d71921', '#1a7f37', '#bf8700', '#8250df']

const newSet = (id: number, i: number): Dataset => ({ id, name: `Misure ${i + 1}`, unit: '', color: COLORS[i % COLORS.length], values: [] })

const initial: StatsState = { sets: [newSet(1, 0)], activeId: 1, nextId: 2, binMode: 'auto', bins: 6, binWidth: 1, binStart: NaN, dists: ['gauss'], relative: false, sensitivity: 0 }

export type StatsAction =
  | { type: 'ADD_SET' }
  | { type: 'REMOVE_SET'; id: number }
  | { type: 'SET_ACTIVE'; id: number }
  | { type: 'UPDATE_SET'; id: number; patch: Partial<Pick<Dataset, 'name' | 'unit' | 'color'>> }
  | { type: 'ADD_VALUES'; id: number; values: number[] }
  | { type: 'UPDATE_VALUE'; id: number; mid: number; v: number }
  | { type: 'REMOVE_VALUE'; id: number; mid: number }
  | { type: 'CLEAR'; id: number }
  | { type: 'SET_OPTS'; opts: Partial<Pick<StatsState, 'binMode' | 'bins' | 'binWidth' | 'binStart' | 'dists' | 'relative' | 'sensitivity'>> }

const mapSet = (s: StatsState, id: number, f: (d: Dataset) => Dataset): StatsState => ({ ...s, sets: s.sets.map((d) => (d.id === id ? f(d) : d)) })

function reducer(s: StatsState, a: StatsAction): StatsState {
  switch (a.type) {
    case 'ADD_SET': {
      const d = newSet(s.nextId, s.sets.length)
      return { ...s, sets: [...s.sets, d], activeId: d.id, nextId: s.nextId + 1 }
    }
    case 'REMOVE_SET': {
      if (s.sets.length <= 1) return mapSet(s, a.id, (d) => ({ ...d, values: [] }))
      const sets = s.sets.filter((d) => d.id !== a.id)
      return { ...s, sets, activeId: s.activeId === a.id ? sets[0].id : s.activeId }
    }
    case 'SET_ACTIVE':
      return { ...s, activeId: a.id }
    case 'UPDATE_SET':
      return mapSet(s, a.id, (d) => ({ ...d, ...a.patch }))
    case 'ADD_VALUES': {
      const vals = a.values.map((v, i) => ({ id: s.nextId + i, v }))
      return { ...mapSet(s, a.id, (d) => ({ ...d, values: [...d.values, ...vals] })), nextId: s.nextId + vals.length }
    }
    case 'UPDATE_VALUE':
      return mapSet(s, a.id, (d) => ({ ...d, values: d.values.map((m) => (m.id === a.mid ? { ...m, v: a.v } : m)) }))
    case 'REMOVE_VALUE':
      return mapSet(s, a.id, (d) => ({ ...d, values: d.values.filter((m) => m.id !== a.mid) }))
    case 'CLEAR':
      return mapSet(s, a.id, (d) => ({ ...d, values: [] }))
    case 'SET_OPTS':
      return { ...s, ...a.opts }
  }
}

const KEY = 'map-your-data-stats'

function load(): StatsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    const saved = JSON.parse(raw) as Partial<StatsState> & { showGauss?: boolean }
    if (!saved.sets?.length) return initial
    // versioni precedenti: bins = 0 voleva dire automatico, showGauss al posto di dists
    const old = saved.binMode === undefined
    const st = { ...initial, ...saved }
    if (old) {
      st.binMode = saved.bins && saved.bins > 0 ? 'count' : 'auto'
      st.bins = saved.bins && saved.bins > 0 ? saved.bins : 6
      st.dists = saved.showGauss === false ? [] : ['gauss']
    }
    // JSON non conserva NaN
    if (st.binStart === null) st.binStart = NaN
    return st
  } catch {
    return initial
  }
}

interface Ctx {
  state: StatsState
  dispatch: Dispatch<StatsAction>
  active: Dataset
  summary: Summary | null
}

const StatsContext = createContext<Ctx | null>(null)

export function StatsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state))
      } catch {
        /* storage non disponibile */
      }
    }, 300)
    return () => clearTimeout(t)
  }, [state])
  const active = state.sets.find((d) => d.id === state.activeId) ?? state.sets[0]
  const summary = useMemo(() => summarize(active.values.map((m) => m.v)), [active.values])
  const value = useMemo(() => ({ state, dispatch, active, summary }), [state, active, summary])
  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStats(): Ctx {
  const c = useContext(StatsContext)
  if (!c) throw new Error('useStats fuori da StatsProvider')
  return c
}

/** Legge numeri separati da spazi, a capo, punto e virgola o tabulazioni (virgola decimale accettata). */
// eslint-disable-next-line react-refresh/only-export-components
export function parseNumbers(text: string): number[] {
  return text
    .split(/[\s;\t]+/)
    .map((t) => parseFloat(t.replace(',', '.')))
    .filter(Number.isFinite)
}
