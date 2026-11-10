import { useEffect, useRef } from 'react'
import { setupCanvas, useSize } from '../lib/useSize'
import { readTheme, tickFmt, ticks } from '../lib/render2d'
import { useThemeKey } from '../lib/useThemeKey'
import type { Row } from './types'

interface Props {
  rows: Row[]
  f: (x: number) => number
  color: string
  /** residui divisi per σy (scarti normalizzati) */
  normalized: boolean
}

/** Grafico dei residui y − f(x), con le barre d'errore. */
export function Residuals({ rows, f, color, normalized }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const { w, h } = useSize(wrap)
  const themeKey = useThemeKey()

  useEffect(() => {
    const c = canvas.current
    if (!c || w === 0 || h === 0) return
    const ctx = setupCanvas(c, w, h)
    const theme = readTheme()
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)
    const pts = rows
      .map((r) => {
        const res = r.y - f(r.x)
        const s = normalized ? (r.ey > 0 ? res / r.ey : NaN) : res
        return { x: r.x, r: s, e: normalized ? 1 : r.ey }
      })
      .filter((p) => Number.isFinite(p.r))
    if (pts.length === 0) return
    const L = 46
    const R = 8
    const T = 8
    const B = 20
    const xs = pts.map((p) => p.x)
    let x0 = Math.min(...xs)
    let x1 = Math.max(...xs)
    const dx = (x1 - x0) * 0.06 || 1
    x0 -= dx
    x1 += dx
    const ym = Math.max(...pts.map((p) => Math.abs(p.r) + (p.e > 0 ? p.e : 0)), normalized ? 2.5 : 0) * 1.15 || 1
    const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (w - L - R)
    const Y = (y: number) => T + ((ym - y) / (2 * ym)) * (h - T - B)

    ctx.font = '11px ui-monospace, Consolas, monospace'
    ctx.strokeStyle = theme.border
    ctx.fillStyle = theme.text
    ctx.lineWidth = 1
    const yt = ticks(-ym, ym, 4)
    const ys = yt.length > 1 ? yt[1] - yt[0] : ym
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.beginPath()
    for (const t of yt) {
      ctx.moveTo(L, Math.round(Y(t)) + 0.5)
      ctx.lineTo(w - R, Math.round(Y(t)) + 0.5)
      ctx.fillText(tickFmt(t, ys), L - 5, Y(t))
    }
    ctx.stroke()
    // fascia ±1σ per gli scarti normalizzati
    if (normalized) {
      ctx.fillStyle = theme.textH
      ctx.globalAlpha = 0.06
      ctx.fillRect(L, Y(1), w - L - R, Y(-1) - Y(1))
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = theme.textH
    ctx.beginPath()
    ctx.moveTo(L, Y(0))
    ctx.lineTo(w - R, Y(0))
    ctx.stroke()
    const xt = ticks(x0, x1, Math.max(3, Math.round(w / 90)))
    const xs2 = xt.length > 1 ? xt[1] - xt[0] : 1
    ctx.fillStyle = theme.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const t of xt) ctx.fillText(tickFmt(t, xs2), X(t), h - B + 5)

    ctx.strokeStyle = color
    ctx.fillStyle = color
    for (const p of pts) {
      const px = X(p.x)
      const py = Y(p.r)
      if (p.e > 0) {
        ctx.beginPath()
        ctx.moveTo(px, Y(p.r - p.e))
        ctx.lineTo(px, Y(p.r + p.e))
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [rows, f, color, normalized, w, h, themeKey])

  return (
    <div className="residuals" ref={wrap}>
      <canvas ref={canvas} />
    </div>
  )
}
