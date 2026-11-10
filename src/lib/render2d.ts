import type { Axes, ColormapName, DataPoint, FieldKind, Grid, ViewOptions } from '../types'
import { cssColor, lut } from './colormaps'
import { contours, levelStep, niceLevels } from './contours'
import { streamlines } from './fieldlines'

export interface Projector {
  toScreen(x: number, y: number): [number, number]
  toWorld(px: number, py: number): [number, number]
  /** direzione sullo schermo (non normalizzata) di un vettore (u,v) espresso negli assi */
  dir(u: number, v: number): [number, number]
}

export interface PlotRect {
  left: number
  top: number
  width: number
  height: number
}

export const PLOT_MARGIN = { left: 58, right: 16, top: 16, bottom: 44 }

/** Proiezione lineare per piano cartesiano e immagine. */
export function planeProjector(axes: Axes, cssW: number, cssH: number): { proj: Projector; rect: PlotRect } {
  const pw = Math.max(10, cssW - PLOT_MARGIN.left - PLOT_MARGIN.right)
  const ph = Math.max(10, cssH - PLOT_MARGIN.top - PLOT_MARGIN.bottom)
  const xr = axes.xmax - axes.xmin || 1
  const yr = axes.ymax - axes.ymin || 1
  let sx = pw / xr
  let sy = ph / yr
  let left = PLOT_MARGIN.left
  let top = PLOT_MARGIN.top
  if (axes.equal) {
    const s = Math.min(sx, sy)
    sx = sy = s
    left += (pw - xr * s) / 2
    top += (ph - yr * s) / 2
  }
  const rect = { left, top, width: xr * sx, height: yr * sy }
  const proj: Projector = {
    toScreen: (x, y) => [left + (x - axes.xmin) * sx, top + (axes.ymax - y) * sy],
    toWorld: (px, py) => [axes.xmin + (px - left) / sx, axes.ymax - (py - top) / sy],
    dir: (u, v) => [u * sx, -v * sy],
  }
  return { proj, rect }
}

// ---------- tacche "belle" ----------

export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
}

export function ticks(min: number, max: number, target: number): number[] {
  if (!(max > min) || !Number.isFinite(max - min)) return [min]
  const step = niceStep(max - min, target)
  const out: number[] = []
  const k0 = Math.ceil(min / step - 1e-9)
  // per indice intero: nessun rischio di ciclo infinito con passi minuscoli
  for (let k = k0; k <= k0 + 200; k++) {
    const v = k * step
    if (v > max + step * 1e-9) break
    out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12))
  }
  return out
}

/** Etichetta di una tacca: tante cifre decimali quante ne servono al passo. */
export function tickFmt(v: number, step: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(step) || Math.abs(v) || 1
  if (a >= 1e5 || a < 1e-4 || Math.abs(v) >= 1e6) return v.toExponential(1)
  const e = Math.floor(Math.log10(a) + 1e-9)
  const mant = a / Math.pow(10, e)
  let d = Math.max(0, -e)
  if (Math.abs(mant - Math.round(mant)) > 1e-6) d++
  return v.toFixed(d)
}

export function fmt(v: number, span = Math.abs(v)): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(span) || Math.abs(v)
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2)
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3
  return v.toFixed(digits)
}

export interface Theme {
  text: string
  textH: string
  border: string
  borderStrong: string
  bg: string
  accent: string
}

export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement)
  const g = (n: string) => cs.getPropertyValue(n).trim()
  return { text: g('--text'), textH: g('--text-h'), border: g('--border'), borderStrong: g('--border-strong'), bg: g('--bg'), accent: g('--accent') }
}

/** Tacche (e linee di griglia) usate per un'area di disegno. */
export function gridTicks(axes: Axes, rect: PlotRect, yInteger = false): { xt: number[]; yt: number[] } {
  let yt = ticks(axes.ymin, axes.ymax, Math.max(3, Math.round(rect.height / 60)))
  // conteggi: solo valori interi
  if (yInteger && yt.length > 1 && yt[1] - yt[0] < 1) yt = ticks(axes.ymin, axes.ymax, Math.max(1, Math.floor(axes.ymax - axes.ymin))).filter((v) => Number.isInteger(v))
  return {
    xt: ticks(axes.xmin, axes.xmax, Math.max(3, Math.round(rect.width / 90))),
    yt,
  }
}

export function drawAxes(ctx: CanvasRenderingContext2D, axes: Axes, proj: Projector, rect: PlotRect, theme: Theme, gridLines: boolean, yInteger = false) {
  ctx.save()
  ctx.font = '12px ui-monospace, Consolas, monospace'
  const { xt, yt } = gridTicks(axes, rect, yInteger)
  const xspan = axes.xmax - axes.xmin
  const yspan = axes.ymax - axes.ymin
  const xstep = xt.length > 1 ? xt[1] - xt[0] : xspan
  const ystep = yt.length > 1 ? yt[1] - yt[0] : yspan

  if (gridLines) {
    ctx.strokeStyle = theme.border
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const x of xt) {
      const [px] = proj.toScreen(x, 0)
      ctx.moveTo(Math.round(px) + 0.5, rect.top)
      ctx.lineTo(Math.round(px) + 0.5, rect.top + rect.height)
    }
    for (const y of yt) {
      const [, py] = proj.toScreen(0, y)
      ctx.moveTo(rect.left, Math.round(py) + 0.5)
      ctx.lineTo(rect.left + rect.width, Math.round(py) + 0.5)
    }
    ctx.stroke()
  }

  ctx.strokeStyle = theme.borderStrong
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(rect.left) + 0.5, Math.round(rect.top) + 0.5, Math.round(rect.width), Math.round(rect.height))

  ctx.fillStyle = theme.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const bottom = rect.top + rect.height
  ctx.beginPath()
  for (const x of xt) {
    const [px] = proj.toScreen(x, 0)
    ctx.moveTo(px, bottom)
    ctx.lineTo(px, bottom + 4)
    ctx.fillText(tickFmt(x, xstep), px, bottom + 7)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const y of yt) {
    const [, py] = proj.toScreen(0, y)
    ctx.moveTo(rect.left - 4, py)
    ctx.lineTo(rect.left, py)
    ctx.fillText(tickFmt(y, ystep), rect.left - 7, py)
  }
  ctx.stroke()

  ctx.fillStyle = theme.textH
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(axes.xlabel, rect.left + rect.width / 2, bottom + 40)
  ctx.save()
  ctx.translate(14, rect.top + rect.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textBaseline = 'middle'
  ctx.fillText(axes.ylabel, 0, 0)
  ctx.restore()

  // assi x = 0 e y = 0 se visibili
  ctx.strokeStyle = theme.text
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  if (axes.xmin < 0 && axes.xmax > 0) {
    const [px] = proj.toScreen(0, 0)
    ctx.moveTo(px, rect.top)
    ctx.lineTo(px, bottom)
  }
  if (axes.ymin < 0 && axes.ymax > 0) {
    const [, py] = proj.toScreen(0, 0)
    ctx.moveTo(rect.left, py)
    ctx.lineTo(rect.left + rect.width, py)
  }
  ctx.stroke()
  ctx.restore()
}

// ---------- campo ----------

export function valueRange(grid: Grid, opts: ViewOptions): [number, number] {
  if (!opts.autoRange && opts.vmax > opts.vmin) return [opts.vmin, opts.vmax]
  // campo (quasi) costante: si apre un intervallo attorno al valore
  const tol = 1e-9 * Math.max(1, Math.abs(grid.zmax), Math.abs(grid.zmin))
  if (grid.zmax - grid.zmin > tol) return [grid.zmin, grid.zmax]
  const pad = Math.max(1, Math.abs(grid.zmax) * 0.1)
  return [grid.zmin - pad, grid.zmax + pad]
}

function rasterize(grid: Grid, cmap: ColormapName, vmin: number, vmax: number, bands: number[] | null): HTMLCanvasElement {
  const { nx, ny, z } = grid
  const c = document.createElement('canvas')
  c.width = nx
  c.height = ny
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(nx, ny)
  const l = lut(cmap)
  const span = vmax - vmin || 1
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = z[j * nx + i]
      const o = ((ny - 1 - j) * nx + i) * 4
      if (Number.isNaN(v)) {
        img.data[o + 3] = 0
        continue
      }
      let t = (v - vmin) / span
      if (bands) {
        // contour riempito: colore costante tra due livelli
        let b = 0
        while (b < bands.length && v > bands[b]) b++
        t = b / bands.length
      }
      const li = Math.max(0, Math.min(255, Math.round(t * 255))) * 3
      img.data[o] = l[li]
      img.data[o + 1] = l[li + 1]
      img.data[o + 2] = l[li + 2]
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function drawRaster(ctx: CanvasRenderingContext2D, grid: Grid, proj: Projector, raster: HTMLCanvasElement, smooth: boolean) {
  const dx = (grid.x1 - grid.x0) / (grid.nx - 1)
  const dy = (grid.y1 - grid.y0) / (grid.ny - 1)
  // i nodi sono i centri dei pixel: si allarga di mezza cella e si ritaglia sul dominio
  const [ax, ay] = proj.toScreen(grid.x0 - dx / 2, grid.y1 + dy / 2)
  const [bx, by] = proj.toScreen(grid.x1 + dx / 2, grid.y0 - dy / 2)
  const [cx0, cy0] = proj.toScreen(grid.x0, grid.y1)
  const [cx1, cy1] = proj.toScreen(grid.x1, grid.y0)
  ctx.save()
  ctx.beginPath()
  ctx.rect(Math.min(cx0, cx1), Math.min(cy0, cy1), Math.abs(cx1 - cx0), Math.abs(cy1 - cy0))
  ctx.clip()
  ctx.imageSmoothingEnabled = smooth
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(raster, ax, ay, bx - ax, by - ay)
  ctx.restore()
}

export function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, head: number) {
  const len = Math.hypot(dx, dy)
  if (len < 0.5) return
  const ux = dx / len
  const uy = dy / len
  const h = Math.min(head, len * 0.45)
  const ex = x + dx
  const ey = y + dy
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(ex - ux * h * 0.6, ey - uy * h * 0.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - ux * h - uy * h * 0.5, ey - uy * h + ux * h * 0.5)
  ctx.lineTo(ex - ux * h + uy * h * 0.5, ey - uy * h - ux * h * 0.5)
  ctx.closePath()
  ctx.fill()
}

const linesCache = new WeakMap<Grid, ReturnType<typeof streamlines>>()

export interface FieldDrawOptions {
  grid: Grid
  opts: ViewOptions
  kind: FieldKind
  proj: Projector
  theme: Theme
}

export function drawField(ctx: CanvasRenderingContext2D, { grid, opts, kind, proj, theme }: FieldDrawOptions) {
  const [vmin, vmax] = valueRange(grid, opts)
  ctx.save()
  ctx.globalAlpha = opts.opacity

  if (opts.view === 'color') {
    drawRaster(ctx, grid, proj, rasterize(grid, opts.colormap, vmin, vmax, null), true)
  }

  if (opts.view === 'contour') {
    const levels = niceLevels(vmin, vmax, opts.levels)
    if (opts.fillContours) drawRaster(ctx, grid, proj, rasterize(grid, opts.colormap, vmin, vmax, levels), false)
    ctx.globalAlpha = 1
    const cl = contours(grid, levels)
    const span = vmax - vmin || 1
    const lstep = levelStep(levels)
    const placed: { x: number; y: number; w: number }[] = []
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.font = '11px ui-monospace, Consolas, monospace'
    for (const { value, segments } of cl) {
      ctx.strokeStyle = opts.fillContours ? theme.textH : cssColor(opts.colormap, (value - vmin) / span)
      ctx.beginPath()
      for (let k = 0; k < segments.length; k += 4) {
        const [ax, ay] = proj.toScreen(segments[k], segments[k + 1])
        const [bx, by] = proj.toScreen(segments[k + 2], segments[k + 3])
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
      }
      ctx.stroke()
      // etichetta del livello: si prova qualche segmento finché non si sovrappone ad altre etichette
      const nseg = segments.length / 4
      if (nseg >= 3) {
        const label = tickFmt(value, lstep)
        const w = ctx.measureText(label).width + 6
        let lx = NaN
        let ly = NaN
        for (const f of [0.5, 0.25, 0.75, 0.1, 0.9, 0.4, 0.6]) {
          const k = Math.floor(nseg * f) * 4
          const [px, py] = proj.toScreen(segments[k], segments[k + 1])
          if (placed.every((q) => Math.abs(q.x - px) > (q.w + w) / 2 + 4 || Math.abs(q.y - py) > 16)) {
            lx = px
            ly = py
            break
          }
        }
        if (Number.isNaN(lx)) continue
        placed.push({ x: lx, y: ly, w })
        ctx.fillStyle = theme.bg
        ctx.globalAlpha = 0.85
        ctx.fillRect(lx - w / 2, ly - 7, w, 14)
        ctx.globalAlpha = 1
        ctx.fillStyle = theme.textH
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, lx, ly)
      }
    }
  }

  if (opts.view === 'lines') {
    // per uno scalare (o una grandezza derivata) lo sfondo mostra i colori e le linee sono neutre
    const background = kind === 'scalar' || opts.quantity !== 'value'
    if (background) drawRaster(ctx, grid, proj, rasterize(grid, opts.colormap, vmin, vmax, null), true)
    ctx.globalAlpha = 1
    let lines = linesCache.get(grid)
    if (!lines) {
      lines = streamlines(grid)
      linesCache.set(grid, lines)
    }
    const span = vmax - vmin || 1
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    for (const l of lines) {
      const n = l.pts.length / 2
      // tratti di 6 passi, ciascuno col colore del modulo locale
      for (let s0 = 0; s0 < n - 1; s0 += 6) {
        const s1 = Math.min(n - 1, s0 + 6)
        const m = l.mag[Math.min(l.mag.length - 1, (s0 + s1) >> 1)]
        ctx.strokeStyle = background ? theme.textH : cssColor(opts.colormap, (m - vmin) / span)
        ctx.beginPath()
        for (let k = s0; k <= s1; k++) {
          const [px, py] = proj.toScreen(l.pts[2 * k], l.pts[2 * k + 1])
          if (k === s0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
      // freccia del verso a metà linea
      const mid = Math.floor(n / 2)
      if (mid + 1 < n) {
        const [ax, ay] = proj.toScreen(l.pts[2 * mid], l.pts[2 * mid + 1])
        const [bx, by] = proj.toScreen(l.pts[2 * mid + 2], l.pts[2 * mid + 3])
        const d = Math.hypot(bx - ax, by - ay) || 1
        const col = background ? theme.textH : cssColor(opts.colormap, (l.mag[mid] - vmin) / span)
        ctx.fillStyle = col
        ctx.strokeStyle = col
        arrow(ctx, ax - ((bx - ax) / d) * 4, ay - ((by - ay) / d) * 4, ((bx - ax) / d) * 8, ((by - ay) / d) * 8, 8)
      }
    }
  }

  if (opts.view === 'vectors') {
    ctx.globalAlpha = 1
    const { nx, ny, gx, gy } = grid
    // ~22 frecce sul lato lungo
    const stride = Math.max(1, Math.round(Math.max(nx, ny) / 22))
    const [sx0, sy0] = proj.toScreen(grid.x0, grid.y0)
    const [sx1] = proj.toScreen(grid.x0 + ((grid.x1 - grid.x0) / (nx - 1)) * stride, grid.y0)
    const [, sy1] = proj.toScreen(grid.x0, grid.y0 + ((grid.y1 - grid.y0) / (ny - 1)) * stride)
    const cell = Math.min(Math.abs(sx1 - sx0), Math.abs(sy1 - sy0))
    let maxMag = 0
    for (let k = 0; k < nx * ny; k++) {
      const m = Math.hypot(gx[k], gy[k])
      if (m > maxMag) maxMag = m
    }
    if (maxMag > 0) {
      const off = Math.floor(((nx - 1) % stride) / 2)
      const offy = Math.floor(((ny - 1) % stride) / 2)
      const span = vmax - vmin || 1
      for (let j = offy; j < ny; j += stride) {
        for (let i = off; i < nx; i += stride) {
          const k = j * nx + i
          const u = gx[k]
          const v = gy[k]
          if (Number.isNaN(u) || Number.isNaN(v)) continue
          const m = Math.hypot(u, v)
          const [dX, dY] = proj.dir(u, v)
          const dl = Math.hypot(dX, dY)
          if (dl === 0) continue
          const L = (m / maxMag) * cell * 0.92
          const x = grid.x0 + ((grid.x1 - grid.x0) * i) / (nx - 1)
          const y = grid.y0 + ((grid.y1 - grid.y0) * j) / (ny - 1)
          const [px, py] = proj.toScreen(x, y)
          const col = cssColor(opts.colormap, (grid.z[k] - vmin) / span)
          ctx.strokeStyle = col
          ctx.fillStyle = col
          ctx.lineWidth = 1.6
          // centra la freccia sul nodo
          const ex = (dX / dl) * L
          const ey = (dY / dl) * L
          arrow(ctx, px - ex / 2, py - ey / 2, ex, ey, 7)
        }
      }
    }
  }
  ctx.restore()
}

export function drawPoints(
  ctx: CanvasRenderingContext2D,
  points: DataPoint[],
  kind: FieldKind,
  proj: Projector,
  theme: Theme,
  selectedId: number | null,
  hoverId: number | null,
) {
  ctx.save()
  // le frecce dei dati vettoriali hanno lunghezza proporzionale al modulo (max = 40 px)
  let maxMag = 0
  if (kind === 'vector') for (const p of points) maxMag = Math.max(maxMag, Math.hypot(p.u, p.v))
  for (const p of points) {
    const [x, y] = proj.toScreen(p.x, p.y)
    if (kind === 'vector' && maxMag > 0) {
      const [dX, dY] = proj.dir(p.u, p.v)
      const dl = Math.hypot(dX, dY)
      if (dl > 0) {
        const L = (Math.hypot(p.u, p.v) / maxMag) * 40
        ctx.strokeStyle = theme.bg
        ctx.fillStyle = theme.bg
        ctx.lineWidth = 4.5
        arrow(ctx, x, y, (dX / dl) * L, (dY / dl) * L, 10)
        ctx.strokeStyle = theme.accent
        ctx.fillStyle = theme.accent
        ctx.lineWidth = 2.2
        arrow(ctx, x, y, (dX / dl) * L, (dY / dl) * L, 9)
      }
    }
    const sel = p.id === selectedId
    const hov = p.id === hoverId
    ctx.beginPath()
    ctx.arc(x, y, sel || hov ? 7 : 5, 0, Math.PI * 2)
    ctx.fillStyle = theme.accent
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()
    if (sel) {
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.strokeStyle = theme.accent
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function hitPoint(points: DataPoint[], proj: Projector, px: number, py: number, radius = 10): DataPoint | null {
  let best: DataPoint | null = null
  let bd = radius * radius
  for (const p of points) {
    const [x, y] = proj.toScreen(p.x, p.y)
    const d = (x - px) ** 2 + (y - py) ** 2
    if (d <= bd) {
      bd = d
      best = p
    }
  }
  return best
}

