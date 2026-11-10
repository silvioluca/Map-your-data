import type { DataPoint, FieldKind, Grid, Interp } from '../types'

export interface Domain {
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface GridRequest {
  points: DataPoint[]
  kind: FieldKind
  method: Interp
  idwPower: number
  domain: Domain
  /** celle lungo il lato più lungo */
  resolution: number
  /** fattore di scala per x (cos(lat) sulla mappa, 1 altrove) per avere distanze isotrope */
  kx: number
  clipHull: boolean
}

/** Funzione interpolante: dati (x,y) restituisce i valori per ciascun canale. */
type Evaluator = (x: number, y: number, out: Float64Array) => void

interface Prepared {
  /** coordinate normalizzate dei nodi */
  px: Float64Array
  py: Float64Array
  /** valori per canale (1 per scalare, 2 per vettore) */
  values: Float64Array[]
  cx: number
  cy: number
  scale: number
  kx: number
}

function prepare(points: DataPoint[], kind: FieldKind, kx: number): Prepared {
  const n = points.length
  let xmin = Infinity
  let xmax = -Infinity
  let ymin = Infinity
  let ymax = -Infinity
  for (const p of points) {
    xmin = Math.min(xmin, p.x * kx)
    xmax = Math.max(xmax, p.x * kx)
    ymin = Math.min(ymin, p.y)
    ymax = Math.max(ymax, p.y)
  }
  const cx = (xmin + xmax) / 2
  const cy = (ymin + ymax) / 2
  const scale = Math.max(xmax - xmin, ymax - ymin) || 1
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    px[i] = (points[i].x * kx - cx) / scale
    py[i] = (points[i].y - cy) / scale
  }
  const values = kind === 'scalar' ? [Float64Array.from(points, (p) => p.s)] : [Float64Array.from(points, (p) => p.u), Float64Array.from(points, (p) => p.v)]
  return { px, py, values, cx, cy, scale, kx }
}

function idw(p: Prepared, power: number): Evaluator {
  const n = p.px.length
  const ch = p.values.length
  return (x, y, out) => {
    const qx = (x * p.kx - p.cx) / p.scale
    const qy = (y - p.cy) / p.scale
    let wsum = 0
    out.fill(0)
    for (let i = 0; i < n; i++) {
      const dx = qx - p.px[i]
      const dy = qy - p.py[i]
      const d2 = dx * dx + dy * dy
      if (d2 < 1e-18) {
        for (let c = 0; c < ch; c++) out[c] = p.values[c][i]
        return
      }
      const w = 1 / Math.pow(d2, power / 2)
      wsum += w
      for (let c = 0; c < ch; c++) out[c] += w * p.values[c][i]
    }
    for (let c = 0; c < ch; c++) out[c] /= wsum
  }
}

function nearest(p: Prepared): Evaluator {
  const n = p.px.length
  const ch = p.values.length
  return (x, y, out) => {
    const qx = (x * p.kx - p.cx) / p.scale
    const qy = (y - p.cy) / p.scale
    let best = 0
    let bd = Infinity
    for (let i = 0; i < n; i++) {
      const dx = qx - p.px[i]
      const dy = qy - p.py[i]
      const d2 = dx * dx + dy * dy
      if (d2 < bd) {
        bd = d2
        best = i
      }
    }
    for (let c = 0; c < ch; c++) out[c] = p.values[c][best]
  }
}

const tpsKernel = (r2: number) => (r2 < 1e-24 ? 0 : 0.5 * r2 * Math.log(r2))

/** Risolve A·X = B (B con più colonne) per eliminazione gaussiana con pivot parziale. */
function solve(A: Float64Array[], B: Float64Array[]): Float64Array[] | null {
  const n = A.length
  const m = B.length
  for (let k = 0; k < n; k++) {
    let piv = k
    let best = Math.abs(A[k][k])
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i][k])
      if (v > best) {
        best = v
        piv = i
      }
    }
    if (best < 1e-12) return null
    if (piv !== k) {
      ;[A[k], A[piv]] = [A[piv], A[k]]
      for (let c = 0; c < m; c++) [B[c][k], B[c][piv]] = [B[c][piv], B[c][k]]
    }
    const rowK = A[k]
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / rowK[k]
      if (f === 0) continue
      const rowI = A[i]
      for (let j = k; j < n; j++) rowI[j] -= f * rowK[j]
      for (let c = 0; c < m; c++) B[c][i] -= f * B[c][k]
    }
  }
  const X = B.map(() => new Float64Array(n))
  for (let c = 0; c < m; c++) {
    for (let i = n - 1; i >= 0; i--) {
      let s = B[c][i]
      for (let j = i + 1; j < n; j++) s -= A[i][j] * X[c][j]
      X[c][i] = s / A[i][i]
    }
  }
  return X
}

/** Spline a lastra sottile (thin-plate spline): superficie liscia che passa per tutti i punti. */
function tps(p: Prepared): Evaluator | null {
  const n = p.px.length
  if (n < 3) return null
  const N = n + 3
  const A = Array.from({ length: N }, () => new Float64Array(N))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = p.px[i] - p.px[j]
      const dy = p.py[i] - p.py[j]
      A[i][j] = tpsKernel(dx * dx + dy * dy)
    }
    A[i][i] += 1e-9
    A[i][n] = A[n][i] = 1
    A[i][n + 1] = A[n + 1][i] = p.px[i]
    A[i][n + 2] = A[n + 2][i] = p.py[i]
  }
  const B = p.values.map((vals) => {
    const b = new Float64Array(N)
    b.set(vals)
    return b
  })
  const W = solve(A, B)
  if (!W) return null
  const ch = W.length
  return (x, y, out) => {
    const qx = (x * p.kx - p.cx) / p.scale
    const qy = (y - p.cy) / p.scale
    for (let c = 0; c < ch; c++) {
      const w = W[c]
      let s = w[n] + w[n + 1] * qx + w[n + 2] * qy
      for (let i = 0; i < n; i++) {
        const dx = qx - p.px[i]
        const dy = qy - p.py[i]
        s += w[i] * tpsKernel(dx * dx + dy * dy)
      }
      out[c] = s
    }
  }
}

export function makeEvaluator(points: DataPoint[], kind: FieldKind, method: Interp, idwPower: number, kx: number): Evaluator | null {
  if (points.length === 0) return null
  const p = prepare(points, kind, kx)
  if (method === 'nearest') return nearest(p)
  if (method === 'tps') {
    const t = tps(p)
    if (t) return t
  }
  // con meno di 3 punti, o punti allineati, la spline non è definita: si ripiega su IDW
  return idw(p, idwPower)
}

// ---------- inviluppo convesso ----------

export function convexHull(pts: [number, number][]): [number, number][] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (s.length < 3) return s
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function insideConvex(hull: [number, number][], x: number, y: number, tol: number): boolean {
  if (hull.length < 3) return false
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    if (cr / len < -tol) return false
  }
  return true
}

// ---------- griglia ----------

export function computeGrid(req: GridRequest): Grid | null {
  const { points, kind, domain, kx } = req
  const ev = makeEvaluator(points, kind, req.method, req.idwPower, kx)
  if (!ev) return null
  const w = (domain.x1 - domain.x0) * kx
  const h = domain.y1 - domain.y0
  if (!(w > 0 && h > 0)) return null
  const res = Math.max(8, Math.round(req.resolution))
  const nx = w >= h ? res : Math.max(8, Math.round((res * w) / h))
  const ny = h > w ? res : Math.max(8, Math.round((res * h) / w))
  const N = nx * ny
  const z = new Float64Array(N)
  const gx = new Float64Array(N)
  const gy = new Float64Array(N)
  const out = new Float64Array(2)
  const dx = (domain.x1 - domain.x0) / (nx - 1)
  const dy = (domain.y1 - domain.y0) / (ny - 1)

  const hull = req.clipHull ? convexHull(points.map((p) => [p.x * kx, p.y])) : null
  const tol = Math.max(dx * kx, dy) * 0.5

  for (let j = 0; j < ny; j++) {
    const y = domain.y0 + j * dy
    for (let i = 0; i < nx; i++) {
      const x = domain.x0 + i * dx
      const k = j * nx + i
      if (hull && !insideConvex(hull, x * kx, y, tol)) {
        z[k] = gx[k] = gy[k] = NaN
        continue
      }
      ev(x, y, out)
      if (kind === 'scalar') z[k] = out[0]
      else {
        gx[k] = out[0]
        gy[k] = out[1]
        z[k] = Math.hypot(out[0], out[1])
      }
    }
  }

  if (kind === 'scalar') {
    // gradiente con differenze centrali (in unità degli assi, x già corretta con kx)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        if (Number.isNaN(z[k])) continue
        const il = i > 0 ? i - 1 : i
        const ir = i < nx - 1 ? i + 1 : i
        const jd = j > 0 ? j - 1 : j
        const ju = j < ny - 1 ? j + 1 : j
        const zl = z[j * nx + il]
        const zr = z[j * nx + ir]
        const zd = z[jd * nx + i]
        const zu = z[ju * nx + i]
        gx[k] = Number.isNaN(zl) || Number.isNaN(zr) ? 0 : (zr - zl) / ((ir - il) * dx * kx)
        gy[k] = Number.isNaN(zd) || Number.isNaN(zu) ? 0 : (zu - zd) / ((ju - jd) * dy)
      }
    }
  }

  let zmin = Infinity
  let zmax = -Infinity
  for (let k = 0; k < N; k++) {
    const v = z[k]
    if (Number.isNaN(v)) continue
    if (v < zmin) zmin = v
    if (v > zmax) zmax = v
  }
  if (!Number.isFinite(zmin)) {
    zmin = 0
    zmax = 1
  }
  return { nx, ny, x0: domain.x0, x1: domain.x1, y0: domain.y0, y1: domain.y1, z, gx, gy, zmin, zmax, kx }
}
