/**
 * Fit ai minimi quadrati (pesati con gli errori, se presenti).
 * - modelli lineari nei parametri (retta, polinomio, logaritmo): QR di Householder
 * - esponenziale: Levenberg–Marquardt partendo dalla linearizzazione con ln y
 * - errori su x: metodo della varianza efficace σ² = σy² + (f'(x)·σx)²
 */

import { compile, ExprError } from '../lib/expr'

export type FitModel = 'none' | 'linear' | 'poly' | 'exp' | 'log' | 'power' | 'sin' | 'gauss' | 'custom'

export interface FitConfig {
  model: FitModel
  degree: number
  /** costante additiva C (esponenziale e gaussiana) */
  expOffset: boolean
  /** formula libera in x (modello 'custom') */
  formula: string
  /** valori iniziali dei parametri della formula libera */
  p0: Record<string, number>
  /** usa σy (e σx) come pesi */
  useErrors: boolean
  /** fit solo sui punti con x nell'intervallo [xmin, xmax] */
  range: boolean
  xmin: number
  xmax: number
}

export function inFitRange(cfg: FitConfig, x: number): boolean {
  if (!cfg.range) return true
  const lo = Math.min(cfg.xmin, cfg.xmax)
  const hi = Math.max(cfg.xmin, cfg.xmax)
  return x >= lo && x <= hi
}

export interface FitParam {
  name: string
  value: number
  err: number
}

export interface FitOk {
  ok: true
  params: FitParam[]
  f: (x: number) => number
  formula: string
  n: number
  dof: number
  chi2: number
  chi2red: number
  r2: number
  /** true se i pesi vengono dagli errori; false se gli errori dei parametri sono stimati dai residui */
  weighted: boolean
  xErrors: boolean
  skipped: number
  /** solo x > 0 per il logaritmo */
  domain: (x: number) => boolean
}

export type FitResult = FitOk | { ok: false; error: string }

export interface FitPoint {
  x: number
  y: number
  ex: number
  ey: number
}

interface ModelDef {
  names: string[]
  f: (x: number, p: number[]) => number
  /** derivata rispetto a x (per la varianza efficace) */
  dfdx: (x: number, p: number[]) => number
  /** funzioni di base se il modello è lineare nei parametri */
  basis?: (x: number) => number[]
  /** jacobiano rispetto ai parametri (se manca: differenze finite) */
  jac?: (x: number, p: number[]) => number[]
  /** valori iniziali da provare (modelli non lineari) */
  starts?: (xs: number[], ys: number[]) => number[][]
  /** forma canonica dei parametri (es. ampiezza positiva) */
  normalize?: (p: number[]) => number[]
  domain: (x: number) => boolean
  formula: string
}

/** Parametri della formula libera: tutti i simboli tranne x. */
export function formulaParams(formula: string): string[] {
  return compile(formula).vars.filter((v) => v !== 'x')
}

function numJac(def: ModelDef): (x: number, p: number[]) => number[] {
  return (x, p) =>
    p.map((v, k) => {
      const h = 1e-6 * Math.max(Math.abs(v), 1e-3)
      const a = [...p]
      const b = [...p]
      a[k] = v + h
      b[k] = v - h
      return (def.f(x, a) - def.f(x, b)) / (2 * h)
    })
}

function numDfdx(f: (x: number, p: number[]) => number): (x: number, p: number[]) => number {
  return (x, p) => {
    const h = 1e-6 * Math.max(Math.abs(x), 1e-3)
    return (f(x + h, p) - f(x - h, p)) / (2 * h)
  }
}

/** Retta pesata semplice (per i valori iniziali). */
function line(xs: number[], ys: number[]): [number, number] | null {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
  }
  if (sxx === 0) return null
  const b = sxy / sxx
  return [my - b * mx, b]
}

function powerStarts(xs: number[], ys: number[]): number[][] {
  const sign = ys.filter((y) => y > 0).length >= ys.length / 2 ? 1 : -1
  const idx = xs.map((x, i) => (x > 0 && ys[i] * sign > 0 ? i : -1)).filter((i) => i >= 0)
  const l = line(
    idx.map((i) => Math.log(xs[i])),
    idx.map((i) => Math.log(ys[i] * sign)),
  )
  return l ? [[sign * Math.exp(l[0]), l[1]]] : [[1, 1]]
}

/** Seno: si prova una griglia di pulsazioni, con ampiezza e fase da un fit lineare. */
function sinStarts(xs: number[], ys: number[]): number[][] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b])
  const sx = order.map((i) => xs[i])
  const span = sx[sx.length - 1] - sx[0] || 1
  const steps = sx.slice(1).map((v, i) => v - sx[i]).filter((d) => d > 0).sort((a, b) => a - b)
  const dmin = steps.length ? steps[Math.floor(steps.length / 2)] : span / xs.length
  const wmin = Math.PI / span
  const wmax = Math.PI / dmin
  const cands: { ssr: number; p: number[] }[] = []
  for (let k = 0; k < 200; k++) {
    const w = wmin * Math.pow(wmax / wmin, k / 199)
    const A = xs.map((x) => [Math.sin(w * x), Math.cos(w * x), 1])
    const r = lstsq(A, ys)
    if (!r) continue
    const [a, b, c] = r.p
    let ssr = 0
    for (let i = 0; i < xs.length; i++) ssr += (ys[i] - (a * A[i][0] + b * A[i][1] + c)) ** 2
    cands.push({ ssr, p: [Math.hypot(a, b), w, Math.atan2(b, a), c] })
  }
  cands.sort((p, q) => p.ssr - q.ssr)
  return cands.slice(0, 4).map((c) => c.p)
}

function gaussStarts(xs: number[], ys: number[], offset: boolean): number[][] {
  const sorted = [...ys].sort((a, b) => a - b)
  const base = offset ? sorted[Math.floor(sorted.length / 2)] : 0
  // picco: massimo (o minimo, se la campana è rovesciata)
  let k = 0
  for (let i = 1; i < ys.length; i++) if (Math.abs(ys[i] - base) > Math.abs(ys[k] - base)) k = i
  const A = ys[k] - base
  let w = 0
  let wx = 0
  let wx2 = 0
  for (let i = 0; i < xs.length; i++) {
    const q = Math.max(0, (ys[i] - base) / A)
    w += q
    wx += q * xs[i]
    wx2 += q * xs[i] * xs[i]
  }
  const mu = w > 0 ? wx / w : xs[k]
  const span = Math.max(...xs) - Math.min(...xs) || 1
  const sig = w > 0 ? Math.sqrt(Math.max(wx2 / w - mu * mu, (span / 20) ** 2)) : span / 6
  const out = [
    [A, mu, sig],
    [A, xs[k], span / 6],
  ]
  return offset ? out.map((p) => [...p, base]) : out
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (n: number) => String(n).split('').map((d) => SUP[+d]).join('')

function modelDef(cfg: FitConfig): ModelDef | null {
  const all = () => true
  switch (cfg.model) {
    case 'linear':
      return {
        names: ['a', 'b'],
        f: (x, p) => p[0] + p[1] * x,
        dfdx: (_x, p) => p[1],
        basis: (x) => [1, x],
        domain: all,
        formula: 'y = a + b·x',
      }
    case 'poly': {
      const d = Math.max(2, Math.min(8, Math.round(cfg.degree)))
      const names = Array.from({ length: d + 1 }, (_, i) => `a${String(i).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('')}`)
      return {
        names,
        f: (x, p) => {
          let s = 0
          for (let i = d; i >= 0; i--) s = s * x + p[i]
          return s
        },
        dfdx: (x, p) => {
          let s = 0
          for (let i = d; i >= 1; i--) s = s * x + i * p[i]
          return s
        },
        basis: (x) => Array.from({ length: d + 1 }, (_, i) => x ** i),
        domain: all,
        formula: 'y = ' + names.map((n, i) => (i === 0 ? n : i === 1 ? `${n}·x` : `${n}·x${sup(i)}`)).join(' + '),
      }
    }
    case 'log':
      return {
        names: ['a', 'b'],
        f: (x, p) => p[0] + p[1] * Math.log(x),
        dfdx: (x, p) => p[1] / x,
        basis: (x) => [1, Math.log(x)],
        domain: (x) => x > 0,
        formula: 'y = a + b·ln(x)',
      }
    case 'exp':
      if (cfg.expOffset)
        return {
          names: ['A', 'B', 'C'],
          f: (x, p) => p[0] * Math.exp(p[1] * x) + p[2],
          dfdx: (x, p) => p[0] * p[1] * Math.exp(p[1] * x),
          jac: (x, p) => {
            const e = Math.exp(p[1] * x)
            return [e, p[0] * x * e, 1]
          },
          domain: all,
          formula: 'y = A·e^(B·x) + C',
        }
      return {
        names: ['A', 'B'],
        f: (x, p) => p[0] * Math.exp(p[1] * x),
        dfdx: (x, p) => p[0] * p[1] * Math.exp(p[1] * x),
        jac: (x, p) => {
          const e = Math.exp(p[1] * x)
          return [e, p[0] * x * e]
        },
        domain: all,
        formula: 'y = A·e^(B·x)',
      }
    case 'power':
      return {
        names: ['A', 'n'],
        f: (x, p) => p[0] * Math.pow(x, p[1]),
        dfdx: (x, p) => p[0] * p[1] * Math.pow(x, p[1] - 1),
        jac: (x, p) => {
          const xn = Math.pow(x, p[1])
          return [xn, p[0] * xn * Math.log(x)]
        },
        starts: powerStarts,
        domain: (x) => x > 0,
        formula: 'y = A·xⁿ',
      }
    case 'sin':
      return {
        names: ['A', 'ω', 'φ', 'C'],
        f: (x, p) => p[0] * Math.sin(p[1] * x + p[2]) + p[3],
        dfdx: (x, p) => p[0] * p[1] * Math.cos(p[1] * x + p[2]),
        jac: (x, p) => {
          const c = Math.cos(p[1] * x + p[2])
          return [Math.sin(p[1] * x + p[2]), p[0] * x * c, p[0] * c, 1]
        },
        starts: sinStarts,
        normalize: ([A, w, ph, C]) => {
          if (w < 0) {
            w = -w
            ph = -ph
            A = -A
          }
          if (A < 0) {
            A = -A
            ph += Math.PI
          }
          ph = Math.atan2(Math.sin(ph), Math.cos(ph))
          return [A, w, ph, C]
        },
        domain: all,
        formula: 'y = A·sin(ω·x + φ) + C',
      }
    case 'gauss': {
      const off = cfg.expOffset
      const g = (x: number, p: number[]) => Math.exp(-((x - p[1]) ** 2) / (2 * p[2] * p[2]))
      return {
        names: off ? ['A', 'μ', 'σ', 'C'] : ['A', 'μ', 'σ'],
        f: (x, p) => p[0] * g(x, p) + (off ? p[3] : 0),
        dfdx: (x, p) => (-p[0] * g(x, p) * (x - p[1])) / (p[2] * p[2]),
        jac: (x, p) => {
          const e = g(x, p)
          const d = x - p[1]
          const j = [e, (p[0] * e * d) / (p[2] * p[2]), (p[0] * e * d * d) / (p[2] * p[2] * p[2])]
          return off ? [...j, 1] : j
        },
        starts: (xs, ys) => gaussStarts(xs, ys, off),
        normalize: (p) => p.map((v, i) => (i === 2 ? Math.abs(v) : v)),
        domain: all,
        formula: off ? 'y = A·e^(−(x−μ)²/2σ²) + C' : 'y = A·e^(−(x−μ)²/2σ²)',
      }
    }
    case 'custom': {
      const c = compile(cfg.formula)
      if (!c.vars.includes('x')) throw new ExprError('la formula deve contenere x')
      const names = c.vars.filter((v) => v !== 'x')
      if (names.length === 0) throw new ExprError('la formula non ha parametri da ricavare')
      const ev = c.evalWith(['x', ...names])
      const f = (x: number, p: number[]) => ev([x, ...p])
      return {
        names,
        f,
        dfdx: numDfdx(f),
        starts: () => [names.map((n) => (Number.isFinite(cfg.p0[n]) ? cfg.p0[n] : 1))],
        domain: all,
        formula: `y = ${cfg.formula.trim()}`,
      }
    }
    default:
      return null
  }
}

// ---------- algebra lineare ----------

/** Minimi quadrati A·p ≈ b con QR di Householder (colonne normalizzate). Restituisce p e (AᵀA)⁻¹. */
function lstsq(A: number[][], b: number[]): { p: number[]; cov: number[][] } | null {
  const m = A.length
  const n = A[0].length
  if (m < n) return null
  // normalizzazione delle colonne per il condizionamento
  const scale = new Array(n).fill(0)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) scale[j] += A[i][j] ** 2
    scale[j] = Math.sqrt(scale[j]) || 1
  }
  const R = A.map((row) => row.map((v, j) => v / scale[j]))
  const y = [...b]
  for (let k = 0; k < n; k++) {
    let norm = 0
    for (let i = k; i < m; i++) norm += R[i][k] ** 2
    norm = Math.sqrt(norm)
    if (norm < 1e-14) return null
    const alpha = R[k][k] > 0 ? -norm : norm
    const v = new Array(m).fill(0)
    v[k] = R[k][k] - alpha
    for (let i = k + 1; i < m; i++) v[i] = R[i][k]
    const vv = v.reduce((s, q) => s + q * q, 0)
    if (vv === 0) continue
    for (let j = k; j < n; j++) {
      let s = 0
      for (let i = k; i < m; i++) s += v[i] * R[i][j]
      const f = (2 * s) / vv
      for (let i = k; i < m; i++) R[i][j] -= f * v[i]
    }
    let s = 0
    for (let i = k; i < m; i++) s += v[i] * y[i]
    const f = (2 * s) / vv
    for (let i = k; i < m; i++) y[i] -= f * v[i]
  }
  for (let k = 0; k < n; k++) if (Math.abs(R[k][k]) < 1e-12) return null
  // sostituzione all'indietro
  const p = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]
    for (let j = i + 1; j < n; j++) s -= R[i][j] * p[j]
    p[i] = s / R[i][i]
  }
  // R⁻¹ (triangolare superiore), cov = R⁻¹ R⁻ᵀ
  const Ri = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let j = 0; j < n; j++) {
    Ri[j][j] = 1 / R[j][j]
    for (let i = j - 1; i >= 0; i--) {
      let s = 0
      for (let k = i + 1; k <= j; k++) s += R[i][k] * Ri[k][j]
      Ri[i][j] = -s / R[i][i]
    }
  }
  const cov = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0
      for (let k = 0; k < n; k++) s += Ri[i][k] * Ri[j][k]
      return s / (scale[i] * scale[j])
    }),
  )
  return { p: p.map((v, j) => v / scale[j]), cov }
}

/** Inversa per Gauss–Jordan (matrici piccole). */
function inverse(M: number[][]): number[][] | null {
  const n = M.length
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    if (Math.abs(A[piv][c]) < 1e-300) return null
    ;[A[c], A[piv]] = [A[piv], A[c]]
    const d = A[c][c]
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = A[r][c]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]
    }
  }
  return A.map((r) => r.slice(n))
}

// ---------- fit ----------

function linearFit(def: ModelDef, xs: number[], ys: number[], w: number[]) {
  const A = xs.map((x, i) => def.basis!(x).map((v) => v * Math.sqrt(w[i])))
  const b = ys.map((y, i) => y * Math.sqrt(w[i]))
  return lstsq(A, b)
}

function chi2Of(def: ModelDef, p: number[], xs: number[], ys: number[], w: number[]) {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += w[i] * (ys[i] - def.f(xs[i], p)) ** 2
  return s
}

function levenberg(def: ModelDef, p0: number[], xs: number[], ys: number[], w: number[]): { p: number[]; cov: number[][] } | null {
  const jac = def.jac ?? numJac(def)
  let p = [...p0]
  let chi = chi2Of(def, p, xs, ys, w)
  if (!Number.isFinite(chi)) return null
  let lambda = 1e-3
  const n = p.length
  for (let it = 0; it < 200; it++) {
    const JtJ = Array.from({ length: n }, () => new Array(n).fill(0))
    const Jtr = new Array(n).fill(0)
    for (let i = 0; i < xs.length; i++) {
      const J = jac(xs[i], p)
      const r = ys[i] - def.f(xs[i], p)
      for (let a = 0; a < n; a++) {
        Jtr[a] += w[i] * J[a] * r
        for (let b = 0; b < n; b++) JtJ[a][b] += w[i] * J[a] * J[b]
      }
    }
    let improved = false
    for (let tries = 0; tries < 12; tries++) {
      const M = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-300 : v)))
      const Mi = inverse(M)
      if (!Mi) {
        lambda *= 10
        continue
      }
      const step = Mi.map((row) => row.reduce((s, v, b) => s + v * Jtr[b], 0))
      const pn = p.map((v, a) => v + step[a])
      const cn = chi2Of(def, pn, xs, ys, w)
      if (Number.isFinite(cn) && cn <= chi) {
        const rel = (chi - cn) / (chi || 1)
        p = pn
        chi = cn
        lambda = Math.max(lambda / 10, 1e-12)
        improved = true
        if (rel < 1e-12) it = 1000
        break
      }
      lambda *= 10
    }
    if (!improved) break
  }
  // covarianza = (JᵀWJ)⁻¹ nel minimo
  const JtJ = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < xs.length; i++) {
    const J = jac(xs[i], p)
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) JtJ[a][b] += w[i] * J[a] * J[b]
  }
  const cov = inverse(JtJ)
  if (!cov || p.some((v) => !Number.isFinite(v))) return null
  if (def.normalize) {
    // la normalizzazione cambia solo segni e fasi: la covarianza resta valida per i moduli
    p = def.normalize(p)
  }
  return { p, cov }
}

/** Valori iniziali per l'esponenziale: retta su ln|y − C|. */
function expStarts(xs: number[], ys: number[], offset: boolean): number[][] {
  const ymin = Math.min(...ys)
  const ymax = Math.max(...ys)
  const range = ymax - ymin || Math.abs(ymax) || 1
  const Cs = offset ? [ymin - 0.05 * range, ymax + 0.05 * range, 0, ymin - range, ymax + range] : [0]
  const out: number[][] = []
  for (const C of Cs) {
    const zs = ys.map((y) => y - C)
    const sign = zs.filter((z) => z > 0).length >= zs.length / 2 ? 1 : -1
    const idx = zs.map((z, i) => (z * sign > 0 ? i : -1)).filter((i) => i >= 0)
    if (idx.length < 2) continue
    const lin = lstsq(
      idx.map((i) => [1, xs[i]]),
      idx.map((i) => Math.log(zs[i] * sign)),
    )
    if (!lin) continue
    const A = sign * Math.exp(lin.p[0])
    const B = lin.p[1]
    out.push(offset ? [A, B, C] : [A, B])
  }
  if (out.length === 0) out.push(offset ? [range, 0, ymin] : [ys[0] || 1, 0])
  return out
}

export function fit(points: FitPoint[], cfg: FitConfig): FitResult {
  let def: ModelDef | null
  try {
    def = modelDef(cfg)
  } catch (e) {
    return { ok: false, error: e instanceof ExprError ? `Formula non valida: ${e.message}` : 'Formula non valida' }
  }
  if (!def) return { ok: false, error: 'Nessun modello' }
  const usable = points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && def.domain(q.x))
  const skipped = points.length - usable.length
  const k = def.names.length
  if (usable.length < k) return { ok: false, error: `Servono almeno ${k} punti${cfg.model === 'log' ? ' con x > 0' : ''}.` }

  const xs = usable.map((q) => q.x)
  const ys = usable.map((q) => q.y)
  const ey = usable.map((q) => Math.abs(q.ey) || 0)
  const ex = usable.map((q) => Math.abs(q.ex) || 0)
  const hasX = cfg.useErrors && ex.some((v) => v > 0)
  // pesato solo se ogni punto ha un errore efficace non nullo
  const weighted = cfg.useErrors && usable.every((_, i) => ey[i] > 0 || ex[i] > 0)

  const solve = (w: number[]) => {
    if (def.basis) return linearFit(def, xs, ys, w)
    let best: { p: number[]; cov: number[][] } | null = null
    let bestChi = Infinity
    for (const p0 of def.starts ? def.starts(xs, ys) : expStarts(xs, ys, cfg.expOffset)) {
      const r = levenberg(def, p0, xs, ys, w)
      if (!r) continue
      const c = chi2Of(def, r.p, xs, ys, w)
      if (c < bestChi) {
        bestChi = c
        best = r
      }
    }
    return best
  }

  // con errori su x si parte da un fit non pesato e poi si itera la varianza efficace
  let w = weighted && !hasX ? ey.map((s) => 1 / (s * s)) : xs.map(() => 1)
  let sol = solve(w)
  if (!sol) return { ok: false, error: 'Il fit non converge: prova un altro modello o controlla i dati.' }
  if (weighted && hasX) {
    // varianza efficace, qualche iterazione
    for (let it = 0; it < 6; it++) {
      w = xs.map((x, i) => {
        const s2 = ey[i] ** 2 + (def.dfdx(x, sol!.p) * ex[i]) ** 2
        return s2 > 0 ? 1 / s2 : 0
      })
      const next = solve(w)
      if (!next) break
      sol = next
    }
  }

  const { p } = sol
  const n = xs.length
  const dof = n - k
  const chi2 = chi2Of(def, p, xs, ys, w)
  const ymean = ys.reduce((a, b) => a + b, 0) / n
  let ssr = 0
  let sst = 0
  for (let i = 0; i < n; i++) {
    ssr += (ys[i] - def.f(xs[i], p)) ** 2
    sst += (ys[i] - ymean) ** 2
  }
  // senza errori: la covarianza si scala con la varianza dei residui
  const s2 = weighted ? 1 : dof > 0 ? chi2 / dof : NaN
  const errs = p.map((_, i) => Math.sqrt(Math.max(0, sol!.cov[i][i] * s2)))

  return {
    ok: true,
    params: def.names.map((name, i) => ({ name, value: p[i], err: errs[i] })),
    f: (x) => def.f(x, p),
    formula: def.formula,
    n,
    dof,
    chi2,
    chi2red: dof > 0 ? chi2 / dof : NaN,
    r2: sst > 0 ? 1 - ssr / sst : NaN,
    weighted,
    xErrors: weighted && hasX,
    skipped,
    domain: def.domain,
  }
}

// ---------- formattazione valore ± errore ----------

const SUPMAP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const pow10 = (k: number) => `10${String(k).split('').map((c) => SUPMAP[c] ?? c).join('')}`

/** "1.234 ± 0.056": errore con 2 cifre significative, valore arrotondato alla stessa cifra. */
export function formatPM(value: number, err: number): string {
  if (!Number.isFinite(value)) return '—'
  if (!Number.isFinite(err) || err <= 0) {
    return `${+value.toPrecision(5)} ± —`
  }
  const big = Math.max(Math.abs(value), err)
  const K = Math.floor(Math.log10(big))
  const useSci = K >= 5 || K <= -4
  const sv = useSci ? value / 10 ** K : value
  const se = useSci ? err / 10 ** K : err
  let e = Math.floor(Math.log10(se))
  let digits = 1 - e
  // l'arrotondamento può far salire una cifra (es. 0.0996 → 0.10)
  if (+se.toFixed(Math.max(0, digits)) >= 10 ** (e + 1) && digits > 0) {
    e += 1
    digits = 1 - e
  }
  let vs: string
  let es: string
  if (digits >= 0) {
    vs = sv.toFixed(digits)
    es = se.toFixed(digits)
  } else {
    const q = 10 ** -digits
    vs = String(Math.round(sv / q) * q)
    es = String(Math.round(se / q) * q)
  }
  return useSci ? `(${vs} ± ${es})·${pow10(K)}` : `${vs} ± ${es}`
}

export const MODEL_LABELS: Record<FitModel, string> = {
  none: 'Nessuno',
  linear: 'Lineare',
  poly: 'Polinomiale',
  exp: 'Esponenziale',
  log: 'Logaritmico',
  power: 'Potenza',
  sin: 'Sinusoidale',
  gauss: 'Gaussiano',
  custom: 'Formula libera',
}
