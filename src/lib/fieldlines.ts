import type { Grid } from '../types'

export type Quantity = 'value' | 'div' | 'curl' | 'gradmag' | 'laplacian'

/** Grandezze disponibili per il tipo di campo, con la loro etichetta. */
export function quantityOptions(kind: 'scalar' | 'vector', name: string): { value: Quantity; label: string; title: string }[] {
  if (kind === 'vector') {
    const v = name || 'v'
    return [
      { value: 'value', label: `|${v}|`, title: 'Modulo del campo' },
      { value: 'div', label: `∇·${v}`, title: 'Divergenza: sorgenti (+) e pozzi (−)' },
      { value: 'curl', label: `(∇×${v})z`, title: 'Rotore, componente perpendicolare al piano: vortici (+ antiorario)' },
    ]
  }
  const f = name || 'f'
  return [
    { value: 'value', label: f, title: 'Valore del campo' },
    { value: 'gradmag', label: `|∇${f}|`, title: 'Modulo del gradiente' },
    { value: 'laplacian', label: `∇²${f}`, title: 'Laplaciano' },
  ]
}

export function quantityLabel(kind: 'scalar' | 'vector', name: string, q: Quantity): string {
  const opts = quantityOptions(kind, name)
  return (opts.find((o) => o.value === q) ?? opts[0]).label
}

/**
 * Grandezze derivate sulla griglia, con differenze centrali:
 *   divergenza ∇·v = ∂vx/∂x + ∂vy/∂y      rotore (∇×v)z = ∂vy/∂x − ∂vx/∂y
 *   per uno scalare: |∇f| e laplaciano ∇²f = ∇·∇f
 * gx, gy restano quelli del campo (servono per vettori e linee di campo).
 */
export function deriveGrid(g: Grid, q: Quantity): Grid {
  if (q === 'value') return g
  const { nx, ny, gx, gy } = g
  const dx = ((g.x1 - g.x0) / (nx - 1)) * g.kx
  const dy = (g.y1 - g.y0) / (ny - 1)
  const at = (a: Float64Array, i: number, j: number) => a[j * nx + i]
  const ddx = (a: Float64Array, i: number, j: number) => {
    const il = i > 0 ? i - 1 : i
    const ir = i < nx - 1 ? i + 1 : i
    return (at(a, ir, j) - at(a, il, j)) / ((ir - il) * dx)
  }
  const ddy = (a: Float64Array, i: number, j: number) => {
    const jd = j > 0 ? j - 1 : j
    const ju = j < ny - 1 ? j + 1 : j
    return (at(a, i, ju) - at(a, i, jd)) / ((ju - jd) * dy)
  }
  const z = new Float64Array(nx * ny)
  let zmin = Infinity
  let zmax = -Infinity
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      let v: number
      if (Number.isNaN(g.z[k])) v = NaN
      else if (q === 'gradmag') v = Math.hypot(gx[k], gy[k])
      else if (q === 'div' || q === 'laplacian') v = ddx(gx, i, j) + ddy(gy, i, j)
      else v = ddx(gy, i, j) - ddy(gx, i, j)
      z[k] = v
      if (Number.isFinite(v)) {
        if (v < zmin) zmin = v
        if (v > zmax) zmax = v
      }
    }
  }
  if (!Number.isFinite(zmin)) {
    zmin = 0
    zmax = 1
  }
  return { ...g, z, zmin, zmax }
}

/**
 * Linee di campo (linee di flusso) con seminatura uniforme:
 * si integra con Runge–Kutta 2 in avanti e all'indietro, fermandosi quando la linea
 * esce dal dominio, si avvicina troppo a un'altra o il campo si annulla.
 * Restituisce polilinee in coordinate degli assi [x0, y0, x1, y1, ...] e il modulo medio di ciascuna.
 */
export function streamlines(g: Grid, density = 22): { pts: number[]; mag: number[] }[] {
  const { nx, ny, gx, gy } = g
  const dxw = (g.x1 - g.x0) / (nx - 1)
  const dyw = (g.y1 - g.y0) / (ny - 1)
  // velocità in "celle al passo": la x è corretta con kx (mappa)
  const sample = (fi: number, fj: number): [number, number, number] | null => {
    if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return null
    const i = Math.min(nx - 2, Math.floor(fi))
    const j = Math.min(ny - 2, Math.floor(fj))
    const tx = fi - i
    const ty = fj - j
    const k00 = j * nx + i
    const k10 = k00 + 1
    const k01 = k00 + nx
    const k11 = k01 + 1
    const u = (gx[k00] * (1 - tx) + gx[k10] * tx) * (1 - ty) + (gx[k01] * (1 - tx) + gx[k11] * tx) * ty
    const v = (gy[k00] * (1 - tx) + gy[k10] * tx) * (1 - ty) + (gy[k01] * (1 - tx) + gy[k11] * tx) * ty
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null
    return [u / (dxw * g.kx), v / dyw, Math.hypot(u, v)]
  }
  let maxSpeed = 0
  for (let k = 0; k < nx * ny; k++) {
    const s = Math.hypot(gx[k] / (dxw * g.kx), gy[k] / dyw)
    if (Number.isFinite(s) && s > maxSpeed) maxSpeed = s
  }
  if (maxSpeed === 0) return []

  // griglia di occupazione: distanza minima tra le linee
  const sep = Math.max(nx, ny) / density
  const ox = Math.ceil(nx / sep)
  const oy = Math.ceil(ny / sep)
  const occ = new Int32Array(ox * oy).fill(-1)
  const cell = (fi: number, fj: number) => Math.min(oy - 1, Math.floor(fj / sep)) * ox + Math.min(ox - 1, Math.floor(fi / sep))
  const step = 0.3
  const lines: { pts: number[]; mag: number[] }[] = []

  const trace = (si: number, sj: number, id: number) => {
    const half = (dir: 1 | -1) => {
      const out: number[] = []
      const mags: number[] = []
      let fi = si
      let fj = sj
      const own: number[] = []
      for (let n = 0; n < 3000; n++) {
        const v1 = sample(fi, fj)
        if (!v1) break
        const s1 = Math.hypot(v1[0], v1[1])
        if (s1 < maxSpeed * 1e-4) break
        const mi = fi + (dir * step * v1[0]) / s1 / 2
        const mj = fj + (dir * step * v1[1]) / s1 / 2
        const v2 = sample(mi, mj)
        if (!v2) break
        const s2 = Math.hypot(v2[0], v2[1])
        if (s2 === 0) break
        fi += (dir * step * v2[0]) / s2
        fj += (dir * step * v2[1]) / s2
        if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) break
        const c = cell(fi, fj)
        // occupata da un'altra linea: ci si ferma
        if (occ[c] !== -1 && occ[c] !== id) break
        if (occ[c] === -1) {
          occ[c] = id
          own.push(c)
        }
        out.push(g.x0 + fi * dxw, g.y0 + fj * dyw)
        mags.push(v2[2])
      }
      return { out, mags }
    }
    const fw = half(1)
    const bw = half(-1)
    const pts: number[] = []
    const mag: number[] = []
    for (let k = bw.out.length - 2; k >= 0; k -= 2) pts.push(bw.out[k], bw.out[k + 1])
    for (let k = bw.mags.length - 1; k >= 0; k--) mag.push(bw.mags[k])
    pts.push(g.x0 + si * dxw, g.y0 + sj * dyw)
    mag.push(mag.length ? mag[mag.length - 1] : 0)
    pts.push(...fw.out)
    mag.push(...fw.mags)
    return { pts, mag }
  }

  // semi al centro delle celle di occupazione, in ordine a spirale dal centro (linee più regolari)
  const seeds: [number, number][] = []
  for (let b = 0; b < oy; b++) for (let a = 0; a < ox; a++) seeds.push([(a + 0.5) * sep, (b + 0.5) * sep])
  const cx = nx / 2
  const cy = ny / 2
  seeds.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy))
  let id = 0
  for (const [si, sj] of seeds) {
    if (si > nx - 1 || sj > ny - 1) continue
    if (occ[cell(si, sj)] !== -1) continue
    if (!sample(si, sj)) continue
    const l = trace(si, sj, id++)
    if (l.pts.length >= 8) lines.push(l)
  }
  return lines
}
