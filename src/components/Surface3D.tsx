import { useEffect, useRef, useState } from 'react'
import { useStore, kxOf } from '../state/store'
import { quantityLabel } from '../lib/fieldlines'
import { setupCanvas, useSize } from '../lib/useSize'
import { colorAt } from '../lib/colormaps'
import { readTheme, tickFmt, ticks, valueRange } from '../lib/render2d'

interface Props {
  themeKey: string
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

interface Cam {
  az: number
  el: number
  zoom: number
  zScale: number
}

const DEFAULT_CAM: Cam = { az: -0.75, el: 0.55, zoom: 1, zScale: 0.7 }
const MAX_N = 56

/** Superficie z = f(x, y) disegnata con l'algoritmo del pittore; si ruota trascinando. */
export function Surface3D({ themeKey, canvasRef }: Props) {
  const { state, grid, points } = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const [cam, setCam] = useState<Cam>(DEFAULT_CAM)
  const drag = useRef<{ x: number; y: number; cam: Cam } | null>(null)
  const { field, opts } = state
  const kx = kxOf(state)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || w === 0 || h === 0) return
    const ctx = setupCanvas(canvas, w, h)
    const theme = readTheme()
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)
    if (!grid) {
      ctx.font = '12px ui-monospace, Consolas, monospace'
      ctx.fillStyle = theme.text
      ctx.textAlign = 'center'
      ctx.fillText('Aggiungi qualche punto per vedere la superficie', w / 2, h / 2)
      return
    }
    const [vmin, vmax] = valueRange(grid, opts)
    const span = vmax - vmin || 1

    // sotto-campionamento della griglia
    const sx = Math.max(1, Math.ceil(grid.nx / MAX_N))
    const sy = Math.max(1, Math.ceil(grid.ny / MAX_N))
    const ni = Math.floor((grid.nx - 1) / sx) + 1
    const nj = Math.floor((grid.ny - 1) / sy) + 1

    // coordinate normalizzate: il lato più lungo va da -1 a 1
    const W = (grid.x1 - grid.x0) * kx
    const H = grid.y1 - grid.y0
    const L = Math.max(W, H)
    const hx = W / L
    const hy = H / L
    const zc = (v: number) => ((v - vmin) / span - 0.5) * 2 * cam.zScale
    const nx = (x: number) => (((x - grid.x0) * kx) / L) * 2 - hx
    const ny = (y: number) => ((y - grid.y0) / L) * 2 - hy

    const ca = Math.cos(cam.az)
    const sa = Math.sin(cam.az)
    const ce = Math.cos(cam.el)
    const se = Math.sin(cam.el)
    const scale = Math.min(w * 0.8, h) * 0.34 * cam.zoom
    const cx = w / 2
    const cy = h / 2 + h * 0.03
    // proiezione ortografica: [x schermo, y schermo, profondità (maggiore = più lontano)]
    const P = (X: number, Y: number, Z: number): [number, number, number] => {
      const xr = X * ca - Y * sa
      const yr = X * sa + Y * ca
      return [cx + xr * scale, cy - (Z * ce + yr * se) * scale, yr * ce - Z * se]
    }

    const zFloor = -cam.zScale
    const zTop = cam.zScale

    // ---- scatola e assi ----
    const corners: [number, number][] = [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ]
    ctx.lineWidth = 1
    // pavimento con griglia
    const xt = ticks(grid.x0, grid.x1, 5)
    const yt = ticks(grid.y0, grid.y1, 5)
    ctx.strokeStyle = theme.border
    ctx.beginPath()
    for (const x of xt) {
      const a = P(nx(x), -hy, zFloor)
      const b = P(nx(x), hy, zFloor)
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
    for (const y of yt) {
      const a = P(-hx, ny(y), zFloor)
      const b = P(hx, ny(y), zFloor)
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
    ctx.stroke()
    ctx.strokeStyle = theme.borderStrong
    ctx.beginPath()
    corners.forEach(([X, Y], i) => {
      const p = P(X, Y, zFloor)
      if (i === 0) ctx.moveTo(p[0], p[1])
      else ctx.lineTo(p[0], p[1])
    })
    ctx.closePath()
    ctx.stroke()

    // spigolo verticale per l'asse z: quello più lontano
    const back = corners.map((c, i) => ({ i, d: P(c[0], c[1], 0)[2] })).sort((a, b) => b.d - a.d)[0].i
    const [bxw, byw] = corners[back]
    // le due pareti posteriori
    const prev = corners[(back + 3) % 4]
    const next = corners[(back + 1) % 4]
    const zt = ticks(vmin, vmax, 5)
    ctx.strokeStyle = theme.border
    ctx.beginPath()
    for (const z of zt) {
      const a = P(prev[0], prev[1], zc(z))
      const b = P(bxw, byw, zc(z))
      const c = P(next[0], next[1], zc(z))
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.lineTo(c[0], c[1])
    }
    ctx.stroke()
    ctx.strokeStyle = theme.borderStrong
    ctx.beginPath()
    for (const c of [prev, corners[back], next]) {
      const a = P(c[0], c[1], zFloor)
      const b = P(c[0], c[1], zTop)
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
    }
    ctx.stroke()

    // ---- superficie ----
    const quads: { d: number; pts: [number, number][]; col: string }[] = []
    const vx: number[][] = []
    for (let j = 0; j < nj; j++) {
      const row: number[] = []
      for (let i = 0; i < ni; i++) row.push(grid.z[j * sy * grid.nx + i * sx])
      vx.push(row)
    }
    const X = (i: number) => nx(grid.x0 + ((grid.x1 - grid.x0) * i * sx) / (grid.nx - 1))
    const Y = (j: number) => ny(grid.y0 + ((grid.y1 - grid.y0) * j * sy) / (grid.ny - 1))
    // luce dall'alto, un po' di lato rispetto alla camera
    const light = [0.35, -0.45, 0.82]
    for (let j = 0; j < nj - 1; j++) {
      for (let i = 0; i < ni - 1; i++) {
        const z00 = vx[j][i]
        const z10 = vx[j][i + 1]
        const z11 = vx[j + 1][i + 1]
        const z01 = vx[j + 1][i]
        if ([z00, z10, z11, z01].some(Number.isNaN)) continue
        const x0 = X(i)
        const x1 = X(i + 1)
        const y0 = Y(j)
        const y1 = Y(j + 1)
        const a = P(x0, y0, zc(z00))
        const b = P(x1, y0, zc(z10))
        const c = P(x1, y1, zc(z11))
        const d = P(x0, y1, zc(z01))
        // normale
        const ux = x1 - x0
        const vy = y1 - y0
        const dzx = (zc(z10) + zc(z11) - zc(z00) - zc(z01)) / 2
        const dzy = (zc(z01) + zc(z11) - zc(z00) - zc(z10)) / 2
        let n0 = -dzx * vy
        let n1 = -dzy * ux
        let n2 = ux * vy
        const nl = Math.hypot(n0, n1, n2) || 1
        n0 /= nl
        n1 /= nl
        n2 /= nl
        const shade = 0.62 + 0.38 * Math.abs(n0 * light[0] + n1 * light[1] + n2 * light[2])
        const t = ((z00 + z10 + z11 + z01) / 4 - vmin) / span
        const [r, g, bb] = colorAt(opts.colormap, t)
        quads.push({
          d: (a[2] + b[2] + c[2] + d[2]) / 4,
          pts: [
            [a[0], a[1]],
            [b[0], b[1]],
            [c[0], c[1]],
            [d[0], d[1]],
          ],
          col: `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(bb * shade)})`,
        })
      }
    }
    quads.sort((p, q) => q.d - p.d)
    ctx.lineWidth = 0.6
    ctx.lineJoin = 'round'
    const wire = ni * nj < 900
    for (const q of quads) {
      ctx.beginPath()
      ctx.moveTo(q.pts[0][0], q.pts[0][1])
      for (let k = 1; k < 4; k++) ctx.lineTo(q.pts[k][0], q.pts[k][1])
      ctx.closePath()
      ctx.fillStyle = q.col
      ctx.fill()
      // un bordo dello stesso colore chiude le fessure tra le facce
      ctx.strokeStyle = wire ? 'rgba(0,0,0,0.25)' : q.col
      ctx.stroke()
    }

    // ---- punti misurati ----
    if (opts.showPoints && opts.quantity === 'value') {
      for (const p of points) {
        const val = field.kind === 'scalar' ? p.s : Math.hypot(p.u, p.v)
        const top = P(nx(p.x), ny(p.y), zc(val))
        const base = P(nx(p.x), ny(p.y), zFloor)
        ctx.strokeStyle = theme.accent
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(base[0], base[1])
        ctx.lineTo(top[0], top[1])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(top[0], top[1], 4, 0, Math.PI * 2)
        ctx.fillStyle = theme.accent
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    // ---- etichette ----
    ctx.font = '11px ui-monospace, Consolas, monospace'
    ctx.fillStyle = theme.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // assi x e y sui bordi del pavimento più vicini
    const yEdge = P(0, -hy, zFloor)[2] < P(0, hy, zFloor)[2] ? -hy : hy
    const xEdge = P(-hx, 0, zFloor)[2] < P(hx, 0, zFloor)[2] ? -hx : hx
    const off = 0.14
    const xs = xt.length > 1 ? xt[1] - xt[0] : 1
    const ys = yt.length > 1 ? yt[1] - yt[0] : 1
    for (const x of xt) {
      const p = P(nx(x), yEdge + Math.sign(yEdge) * off, zFloor)
      ctx.fillText(tickFmt(x, xs), p[0], p[1])
    }
    for (const y of yt) {
      const p = P(xEdge + Math.sign(xEdge) * off, ny(y), zFloor)
      ctx.fillText(tickFmt(y, ys), p[0], p[1])
    }
    const zs = zt.length > 1 ? zt[1] - zt[0] : 1
    // asse z sul più a sinistra dei tre spigoli verticali disegnati
    const left = [prev, corners[back], next].map((c) => ({ c, s: P(c[0], c[1], 0)[0] })).sort((a, b) => a.s - b.s)[0].c
    ctx.textAlign = 'right'
    for (const z of zt) {
      const p = P(left[0], left[1], zc(z))
      ctx.fillText(tickFmt(z, zs), p[0] - 8, p[1])
    }
    ctx.fillStyle = theme.textH
    ctx.textAlign = 'center'
    const isMap = state.mode === 'map'
    const ax = state.mode === 'map' ? null : state.axes[state.mode]
    const xl = isMap ? 'lon' : ax!.xlabel
    const yl = isMap ? 'lat' : ax!.ylabel
    const px = P(0, yEdge + Math.sign(yEdge) * off * 2.6, zFloor)
    ctx.fillText(xl, px[0], px[1])
    const py = P(xEdge + Math.sign(xEdge) * off * 2.6, 0, zFloor)
    ctx.fillText(yl, py[0], py[1])
    const zlab = quantityLabel(field.kind, field.name, opts.quantity) + (field.unit && opts.quantity === 'value' ? ` (${field.unit})` : '')
    const pz = P(left[0], left[1], zTop + 0.18)
    ctx.fillText(zlab, pz[0], pz[1])
  }, [w, h, grid, opts, cam, points, field, kx, state.mode, state.axes, themeKey, canvasRef])

  // ---- interazione ----
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, cam }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const az = d.cam.az - (e.clientX - d.x) * 0.008
    const el = Math.max(-0.05, Math.min(Math.PI / 2, d.cam.el + (e.clientY - d.y) * 0.008))
    setCam({ ...d.cam, az, el })
  }
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setCam((k) => ({ ...k, zoom: Math.max(0.4, Math.min(4, k.zoom * Math.exp(-e.deltaY * 0.0012))) }))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [canvasRef])

  return (
    <div className="stage__canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage__canvas stage__canvas--3d"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
      />
      <div className="surface-controls">
        <label className="control-bar__field" title="Esagerazione verticale">
          z
          <input type="range" min={0.15} max={1.6} step={0.05} value={cam.zScale} onChange={(e) => setCam({ ...cam, zScale: +e.target.value })} />
        </label>
        <button className="graphs__download" onClick={() => setCam({ ...cam, az: 0, el: Math.PI / 2 })}>
          Dall’alto
        </button>
        <button className="graphs__download" onClick={() => setCam(DEFAULT_CAM)}>
          Reset
        </button>
      </div>
      <div className="stage__hint stage__hint--corner">Trascina per ruotare · rotella per lo zoom</div>
    </div>
  )
}
