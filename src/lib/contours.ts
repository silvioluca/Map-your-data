import type { Grid } from '../types'

/** Segmenti di isolinea in coordinate degli assi: [x1, y1, x2, y2, ...]. */
export interface ContourLevel {
  value: number
  segments: number[]
}

/** Circa `count` livelli con valori rotondi, strettamente dentro (min, max). */
export function niceLevels(min: number, max: number, count: number): number[] {
  if (!(max > min) || !Number.isFinite(max - min)) return [min]
  const raw = (max - min) / (count + 1)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  const step = (n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10) * mag
  const out: number[] = []
  const k0 = Math.floor(min / step) + 1
  for (let k = k0; k <= k0 + 500; k++) {
    const v = k * step
    if (v >= max - step * 1e-9) break
    if (v > min + step * 1e-9) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12))
  }
  return out.length ? out : [(min + max) / 2]
}

export function levelStep(levels: number[]): number {
  return levels.length > 1 ? levels[1] - levels[0] : Math.abs(levels[0]) || 1
}

/** Marching squares sulla griglia. */
export function contours(g: Grid, levels: number[]): ContourLevel[] {
  const { nx, ny, z } = g
  const dx = (g.x1 - g.x0) / (nx - 1)
  const dy = (g.y1 - g.y0) / (ny - 1)
  const X = (i: number) => g.x0 + i * dx
  const Y = (j: number) => g.y0 + j * dy

  return levels.map((L) => {
    const seg: number[] = []
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = z[j * nx + i] // basso-sinistra
        const b = z[j * nx + i + 1] // basso-destra
        const c = z[(j + 1) * nx + i + 1] // alto-destra
        const d = z[(j + 1) * nx + i] // alto-sinistra
        if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue
        const code = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0)
        if (code === 0 || code === 15) continue
        const lerp = (v1: number, v2: number) => (L - v1) / (v2 - v1)
        // punti sui quattro lati
        const bottom = () => [X(i) + lerp(a, b) * dx, Y(j)]
        const right = () => [X(i + 1), Y(j) + lerp(b, c) * dy]
        const top = () => [X(i) + lerp(d, c) * dx, Y(j + 1)]
        const left = () => [X(i), Y(j) + lerp(a, d) * dy]
        const push = (p: number[], q: number[]) => seg.push(p[0], p[1], q[0], q[1])
        const center = (a + b + c + d) / 4
        switch (code) {
          case 1:
          case 14:
            push(left(), bottom())
            break
          case 2:
          case 13:
            push(bottom(), right())
            break
          case 3:
          case 12:
            push(left(), right())
            break
          case 4:
          case 11:
            push(right(), top())
            break
          case 6:
          case 9:
            push(bottom(), top())
            break
          case 7:
          case 8:
            push(left(), top())
            break
          case 5:
            if (center > L) {
              push(left(), top())
              push(bottom(), right())
            } else {
              push(left(), bottom())
              push(right(), top())
            }
            break
          case 10:
            if (center > L) {
              push(left(), bottom())
              push(right(), top())
            } else {
              push(left(), top())
              push(bottom(), right())
            }
            break
        }
      }
    }
    return { value: L, segments: seg }
  })
}
