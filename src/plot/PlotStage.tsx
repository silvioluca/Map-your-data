import { useEffect, useMemo, useRef, useState } from 'react'
import { OPS_COLORS, resolveOps, usePlot, type VecRef } from './store'
import { useSize, setupCanvas } from '../lib/useSize'
import { arrow, drawAxes, gridTicks, planeProjector, readTheme, type PlotRect, type Projector, type Theme } from '../lib/render2d'
import { inFitRange, MODEL_LABELS, type FitResult } from './fit'
import { PlotPointEditor, type PlotEditorTarget } from './PlotPointEditor'
import type { PlotAxes, Row, RowInput, Series } from './types'

interface Props {
  themeKey: string
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

type Hit = { sid: number; rid: number; part: 'point' | 'tip' }

type Drag =
  | { kind: 'point'; sid: number; rid: number; sx: number; sy: number; moved: boolean; part: 'point' | 'tip' }
  | { kind: 'pan'; sx: number; sy: number; axes: PlotAxes; moved: boolean; open: boolean }
  | { kind: 'range'; end: 'xmin' | 'xmax'; sx: number; sy: number; moved: boolean }
  | { kind: 'newvec'; sx: number; sy: number; wx: number; wy: number; ex: number; ey: number; moved: boolean }

const HIT_R = 9

/** Arrotonda una coordinata presa col mouse a ~4 cifre significative rispetto alla vista. */
function snap(v: number, span: number): number {
  const q = Math.pow(10, Math.floor(Math.log10(Math.abs(span) || 1)) - 3)
  return +(Math.round(v / q) * q).toPrecision(12)
}

function drawSeries(ctx: CanvasRenderingContext2D, ser: Series, proj: Projector, rect: PlotRect, theme: Theme, showErrors: boolean, fitRes: FitResult | undefined, axes: PlotAxes, sel: { sid: number; rid: number } | null, hov: { sid: number; rid: number } | null) {
  const c = ser.color
  // curva di fit
  if (fitRes?.ok) {
    for (const inside of [true, false]) {
    if (!inside && !ser.fit.range) continue
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = inside ? 2 : 1.4
    ctx.globalAlpha = inside ? 0.9 : 0.55
    if (!inside) ctx.setLineDash([6, 5])
    ctx.beginPath()
    let pen = false
    const N = Math.max(200, Math.round(rect.width))
    for (let i = 0; i <= N; i++) {
      const x = axes.xmin + ((axes.xmax - axes.xmin) * i) / N
      if (!fitRes.domain(x) || inFitRange(ser.fit, x) !== inside) {
        pen = false
        continue
      }
      const y = fitRes.f(x)
      const [px, py] = proj.toScreen(x, y)
      if (!Number.isFinite(py) || Math.abs(py) > 1e6) {
        pen = false
        continue
      }
      if (pen) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
      pen = true
    }
    ctx.stroke()
    ctx.restore()
    }
  }

  if (ser.connect && ser.rows.length > 1) {
    ctx.save()
    ctx.strokeStyle = c
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ser.rows.forEach((r, i) => {
      const [px, py] = proj.toScreen(r.x, r.y)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
    ctx.restore()
  }

  for (const r of ser.rows) {
    const [px, py] = proj.toScreen(r.x, r.y)
    const isSel = sel?.sid === ser.id && sel.rid === r.id
    const isHov = hov?.sid === ser.id && hov.rid === r.id
    ctx.save()
    // i punti esclusi dal fit restano visibili ma sbiaditi
    if (ser.kind === 'points' && ser.fit.model !== 'none' && !inFitRange(ser.fit, r.x)) ctx.globalAlpha = 0.35
    if (ser.kind === 'vectors') {
      const [tx, ty] = proj.toScreen(r.x + r.vx, r.y + r.vy)
      ctx.strokeStyle = c
      ctx.fillStyle = c
      ctx.lineWidth = isSel || isHov ? 3 : 2.2
      arrow(ctx, px, py, tx - px, ty - py, 11)
      ctx.beginPath()
      ctx.arc(px, py, isSel || isHov ? 5 : 3.5, 0, Math.PI * 2)
      ctx.fill()
      if (isSel || isHov) {
        // maniglia sulla punta
        ctx.beginPath()
        ctx.arc(tx, ty, 6, 0, Math.PI * 2)
        ctx.strokeStyle = theme.textH
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    } else {
      if (showErrors && (r.ex > 0 || r.ey > 0)) {
        ctx.strokeStyle = c
        ctx.lineWidth = 1.3
        ctx.beginPath()
        if (r.ey > 0) {
          const [, y0] = proj.toScreen(r.x, r.y - r.ey)
          const [, y1] = proj.toScreen(r.x, r.y + r.ey)
          ctx.moveTo(px, y0)
          ctx.lineTo(px, y1)
          ctx.moveTo(px - 4, y0)
          ctx.lineTo(px + 4, y0)
          ctx.moveTo(px - 4, y1)
          ctx.lineTo(px + 4, y1)
        }
        if (r.ex > 0) {
          const [x0] = proj.toScreen(r.x - r.ex, r.y)
          const [x1] = proj.toScreen(r.x + r.ex, r.y)
          ctx.moveTo(x0, py)
          ctx.lineTo(x1, py)
          ctx.moveTo(x0, py - 4)
          ctx.lineTo(x0, py + 4)
          ctx.moveTo(x1, py - 4)
          ctx.lineTo(x1, py + 4)
        }
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(px, py, isSel || isHov ? 6.5 : 4.5, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = theme.bg
      ctx.stroke()
    }
    if (isSel) {
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.strokeStyle = c
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, series: Series[], fits: Map<number, FitResult>, rect: PlotRect, theme: Theme) {
  const items: { color: string; label: string; line: boolean; vec: boolean }[] = []
  for (const s of series) {
    if (!s.visible || s.rows.length === 0) continue
    items.push({ color: s.color, label: s.name, line: false, vec: s.kind === 'vectors' })
    const f = fits.get(s.id)
    if (f?.ok) items.push({ color: s.color, label: `fit ${MODEL_LABELS[s.fit.model].toLowerCase()}${s.fit.model === 'poly' ? ` (grado ${s.fit.degree})` : ''}`, line: true, vec: false })
  }
  if (items.length < 2 && !items.some((i) => i.line)) return
  ctx.save()
  ctx.font = '12px ui-monospace, Consolas, monospace'
  const w = Math.max(...items.map((i) => ctx.measureText(i.label).width)) + 40
  const h = items.length * 18 + 10
  const x = rect.left + rect.width - w - 10
  const y = rect.top + 10
  ctx.fillStyle = theme.bg
  ctx.globalAlpha = 0.9
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.border
  ctx.strokeRect(x + 0.5, y + 0.5, w, h)
  items.forEach((it, i) => {
    const cy = y + 14 + i * 18
    ctx.strokeStyle = it.color
    ctx.fillStyle = it.color
    if (it.line) {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x + 8, cy)
      ctx.lineTo(x + 26, cy)
      ctx.stroke()
    } else if (it.vec) {
      ctx.lineWidth = 2
      arrow(ctx, x + 8, cy, 18, 0, 7)
    } else {
      ctx.beginPath()
      ctx.arc(x + 17, cy, 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = theme.textH
    ctx.textBaseline = 'middle'
    ctx.fillText(it.label, x + 32, cy)
  })
  ctx.restore()
}

/** Etichetta colorata accanto a un vettore: le lettere minuscole hanno la freccia sopra. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, theme: Theme) {
  ctx.save()
  ctx.font = 'italic bold 14px Georgia, "Times New Roman", serif'
  const parts = text.split('')
  const widths = parts.map((c) => ctx.measureText(c).width)
  const tw = widths.reduce((a, b) => a + b, 0)
  const w = tw + 10
  const h = 28
  ctx.fillStyle = theme.bg
  ctx.globalAlpha = 0.9
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.globalAlpha = 1
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1)
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  let cx = x - tw / 2
  const base = y + 8
  parts.forEach((c, i) => {
    ctx.fillText(c, cx, base)
    if (/[a-z]/.test(c)) {
      // freccia sopra la lettera
      const x0 = cx + 1
      const x1 = cx + widths[i] + 1
      // le lettere con l'asta (b, d, l...) vogliono la freccia piu' in alto
      const ay = base - (/[bdfhklt]/.test(c) ? 15 : 11.5)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x0, ay)
      ctx.lineTo(x1, ay)
      ctx.moveTo(x1 - 3, ay - 2.5)
      ctx.lineTo(x1, ay)
      ctx.lineTo(x1 - 3, ay + 2.5)
      ctx.stroke()
    }
    cx += widths[i]
  })
  ctx.restore()
}

/** A, B e i risultati delle operazioni, ognuno con il suo colore. */
function drawOps(ctx: CanvasRenderingContext2D, A: VecRef, B: VecRef, show: { sum: boolean; diff: boolean }, proj: Projector, theme: Theme) {
  const a = A.row
  const b = B.row
  const S = (x: number, y: number) => proj.toScreen(x, y)
  const vec = (x: number, y: number, vx: number, vy: number, color: string, width: number, dash: number[] = []) => {
    const [px, py] = S(x, y)
    const [tx, ty] = S(x + vx, y + vy)
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    arrow(ctx, px, py, tx - px, ty - py, 12)
    ctx.restore()
    return [px, py, tx, ty] as const
  }
  const label = (text: string, m: readonly number[], color: string) => {
    // etichetta poco oltre la punta, nella direzione del vettore
    const dx = m[2] - m[0]
    const dy = m[3] - m[1]
    const l = Math.hypot(dx, dy) || 1
    tag(ctx, text, m[2] + (dx / l) * 18, m[3] + (dy / l) * 18, color, theme)
  }
  if (show.sum) {
    // regola punta-coda: B spostato sulla punta di A
    vec(a.x + a.vx, a.y + a.vy, b.vx, b.vy, OPS_COLORS.b, 1.5, [5, 4])
    label('a+b', vec(a.x, a.y, a.vx + b.vx, a.vy + b.vy, OPS_COLORS.sum, 3), OPS_COLORS.sum)
  }
  if (show.diff) {
    vec(a.x + a.vx, a.y + a.vy, -b.vx, -b.vy, OPS_COLORS.b, 1.5, [2, 4])
    label('a−b', vec(a.x, a.y, a.vx - b.vx, a.vy - b.vy, OPS_COLORS.diff, 3), OPS_COLORS.diff)
  }
  label('b', vec(b.x, b.y, b.vx, b.vy, OPS_COLORS.b, 3.2), OPS_COLORS.b)
  label('a', vec(a.x, a.y, a.vx, a.vy, OPS_COLORS.a, 3.2), OPS_COLORS.a)
}

export function PlotStage({ themeKey, canvasRef }: Props) {
  const { state, dispatch, active, fits, view, display, activeDisplay } = usePlot()
  // serie come appaiono sul grafico (con le colonne scelte per gli assi)
  const shownList = state.series.map((s) => display.get(s.id)?.ser ?? s)
  const activeShown = activeDisplay.ser
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2800)
    return () => clearTimeout(t)
  }, [notice])
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const drag = useRef<Drag | null>(null)
  const [frozen, setFrozen] = useState<PlotAxes | null>(null)
  const [preview, setPreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [editor, setEditor] = useState<PlotEditorTarget | null>(null)
  const [cursor, setCursor] = useState('crosshair')
  /** punto a cui si e' agganciato lo snap (riscontro visivo) */
  const [mark, setMark] = useState<[number, number] | null>(null)
  const opsInfo = active.kind === 'vectors' ? resolveOps(state, active) : null

  // durante un trascinamento gli assi automatici restano fermi
  const axes = frozen ?? view
  const { proj, rect } = useMemo(() => planeProjector(axes, w, h), [axes, w, h])

  useEffect(() => {
    if (!editor || editor.rid === null) return
    const ser = state.series.find((s) => s.id === editor.sid)
    if (!ser?.rows.some((r) => r.id === editor.rid)) setEditor(null)
  }, [state.series, editor])

  // ---------- disegno ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || w === 0 || h === 0) return
    const ctx = setupCanvas(canvas, w, h)
    const theme = readTheme()
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)
    drawAxes(ctx, axes, proj, rect, theme, axes.grid)
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.left, rect.top, rect.width, rect.height)
    ctx.clip()
    // la serie attiva per ultima, sopra le altre
    const ordered = [...shownList.filter((s) => s.id !== active.id), activeShown]
    for (const ser of ordered) if (ser.visible) drawSeries(ctx, ser, proj, rect, theme, state.showErrors, fits.get(ser.id), axes, state.selected, state.hover)
    if (rangeOn) {
      const [x0] = proj.toScreen(Math.min(active.fit.xmin, active.fit.xmax), 0)
      const [x1] = proj.toScreen(Math.max(active.fit.xmin, active.fit.xmax), 0)
      ctx.save()
      ctx.fillStyle = theme.textH
      ctx.globalAlpha = 0.05
      ctx.fillRect(rect.left, rect.top, x0 - rect.left, rect.height)
      ctx.fillRect(x1, rect.top, rect.left + rect.width - x1, rect.height)
      ctx.globalAlpha = 1
      ctx.strokeStyle = active.color
      ctx.fillStyle = active.color
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      for (const lx of [x0, x1]) {
        ctx.beginPath()
        ctx.moveTo(lx, rect.top)
        ctx.lineTo(lx, rect.top + rect.height)
        ctx.stroke()
        // maniglia
        ctx.fillRect(lx - 4, rect.top + rect.height / 2 - 12, 8, 24)
      }
      ctx.restore()
    }
    if (opsInfo?.A && opsInfo.B) drawOps(ctx, opsInfo.A, opsInfo.B, state.ops, proj, theme)
    if (mark) {
      const [mx, my] = proj.toScreen(mark[0], mark[1])
      ctx.save()
      ctx.strokeStyle = theme.textH
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(mx, my, 7, 0, Math.PI * 2)
      ctx.moveTo(mx - 11, my)
      ctx.lineTo(mx + 11, my)
      ctx.moveTo(mx, my - 11)
      ctx.lineTo(mx, my + 11)
      ctx.stroke()
      ctx.restore()
    }
    if (preview) {
      const [ax, ay] = proj.toScreen(preview.x0, preview.y0)
      const [bx, by] = proj.toScreen(preview.x1, preview.y1)
      ctx.strokeStyle = active.color
      ctx.fillStyle = active.color
      ctx.lineWidth = 2.2
      ctx.setLineDash([5, 4])
      arrow(ctx, ax, ay, bx - ax, by - ay, 11)
    }
    ctx.restore()
    drawLegend(ctx, shownList, fits, rect, theme)

    if (state.series.every((s) => s.rows.length === 0)) {
      ctx.save()
      ctx.font = '12px ui-monospace, Consolas, monospace'
      const msg = active.kind === 'vectors' ? 'Trascina sul piano per disegnare un vettore, o compila la tabella' : 'Clicca sul piano per aggiungere un punto, o compila la tabella'
      const tw = ctx.measureText(msg).width + 20
      ctx.fillStyle = theme.bg
      ctx.globalAlpha = 0.9
      ctx.fillRect(rect.left + rect.width / 2 - tw / 2, rect.top + 12, tw, 24)
      ctx.globalAlpha = 1
      ctx.fillStyle = theme.textH
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(msg, rect.left + rect.width / 2, rect.top + 24)
      ctx.restore()
    }
  }, [w, h, axes, proj, rect, state.series, display, state.showErrors, state.selected, state.hover, state.ops, opsInfo?.A, opsInfo?.B, mark, active, fits, preview, themeKey, canvasRef])

  // ---------- interazione ----------
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const inPlot = (px: number, py: number) => px >= rect.left && px <= rect.left + rect.width && py >= rect.top && py <= rect.top + rect.height

  const hitTest = (px: number, py: number): Hit | null => {
    let best: Hit | null = null
    let bd = HIT_R * HIT_R
    // la serie attiva ha la precedenza
    const ordered = [activeShown, ...shownList.filter((s) => s.id !== active.id)]
    for (const ser of ordered) {
      if (!ser.visible) continue
      for (const r of ser.rows) {
        const cands: [number, number, Hit['part']][] = [[r.x, r.y, 'point']]
        if (ser.kind === 'vectors') cands.unshift([r.x + r.vx, r.y + r.vy, 'tip'])
        for (const [x, y, part] of cands) {
          const [sx, sy] = proj.toScreen(x, y)
          const d = (sx - px) ** 2 + (sy - py) ** 2
          if (d < bd) {
            bd = d
            best = { sid: ser.id, rid: r.id, part }
          }
        }
      }
      if (best) return best
    }
    return best
  }

  const rangeOn = active.kind === 'points' && active.fit.model !== 'none' && active.fit.range
  /** estremo dell'intervallo di fit vicino al cursore */
  const hitRange = (px: number, py: number): 'xmin' | 'xmax' | null => {
    if (!rangeOn || !inPlot(px, py)) return null
    for (const end of ['xmin', 'xmax'] as const) {
      const [lx] = proj.toScreen(active.fit[end], 0)
      if (Math.abs(lx - px) <= 6) return end
    }
    return null
  }

  const lastRow = (): Row | undefined => active.rows[active.rows.length - 1]
  const sx_ = (v: number) => snap(v, axes.xmax - axes.xmin)
  const sy_ = (v: number) => snap(v, axes.ymax - axes.ymin)
  const world = (px: number, py: number): [number, number] => {
    const [x, y] = proj.toWorld(px, py)
    return [sx_(x), sy_(y)]
  }

  /** Coordinate con lo snap magnetico (solo vettori): prima gli estremi degli altri vettori, poi le linee della griglia. */
  const magnet = (px: number, py: number, exclude: { sid: number; rid: number } | null = null): [number, number] => {
    if (!(state.snap.on && active.kind === 'vectors')) {
      setMark(null)
      return world(px, py)
    }
    if (state.snap.ends) {
      let best: [number, number] | null = null
      let bd = 12 * 12
      for (const ser of state.series) {
        if (!ser.visible || ser.kind !== 'vectors') continue
        for (const r of ser.rows) {
          if (exclude && exclude.sid === ser.id && exclude.rid === r.id) continue
          for (const [x, y] of [
            [r.x, r.y],
            [r.x + r.vx, r.y + r.vy],
          ]) {
            const [sx, sy] = proj.toScreen(x, y)
            const d = (sx - px) ** 2 + (sy - py) ** 2
            if (d < bd) {
              bd = d
              best = [x, y]
            }
          }
        }
      }
      if (best) {
        setMark(best)
        return best
      }
    }
    let [x, y] = world(px, py)
    let snapped = false
    if (state.snap.grid) {
      const { xt, yt } = gridTicks(axes, rect)
      // anche le mezze linee: la griglia magnetica e' piu' fitta di quella disegnata
      const half = (t: number[]) => (t.length > 1 ? [...t, ...t.slice(1).map((v, i) => (v + t[i]) / 2)] : t)
      for (const gx of half(xt)) {
        if (Math.abs(proj.toScreen(gx, 0)[0] - px) <= 8) {
          x = +gx.toPrecision(12)
          snapped = true
          break
        }
      }
      for (const gy of half(yt)) {
        if (Math.abs(proj.toScreen(0, gy)[1] - py) <= 8) {
          y = +gy.toPrecision(12)
          snapped = true
          break
        }
      }
    }
    setMark(snapped ? [x, y] : null)
    return [x, y]
  }

  const openNew = (x: number, y: number, sx: number, sy: number, vx?: number, vy?: number) => {
    const last = lastRow()
    const row: RowInput = { x, y, ex: last?.ex ?? 0, ey: last?.ey ?? 0, vx: vx ?? last?.vx ?? 1, vy: vy ?? last?.vy ?? 0 }
    setEditor({ sid: active.id, rid: null, row, sx, sy })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const [px, py] = local(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const panRequested = e.shiftKey || e.button === 1
    const hit = panRequested ? null : hitTest(px, py)
    if (hit) {
      if (hit.sid !== active.id) dispatch({ type: 'SET_ACTIVE', id: hit.sid })
      dispatch({ type: 'SELECT', sel: { sid: hit.sid, rid: hit.rid } })
      drag.current = { kind: 'point', sid: hit.sid, rid: hit.rid, sx: px, sy: py, moved: false, part: hit.part }
      return
    }
    const end = panRequested ? null : hitRange(px, py)
    if (end) {
      drag.current = { kind: 'range', end, sx: px, sy: py, moved: false }
      return
    }
    const hadEditor = !!editor
    setEditor(null)
    if (!inPlot(px, py)) return
    if (!panRequested && active.kind === 'vectors' && !hadEditor) {
      const [wx, wy] = magnet(px, py)
      drag.current = { kind: 'newvec', sx: px, sy: py, wx, wy, ex: wx, ey: wy, moved: false }
      setFrozen(view)
      return
    }
    drag.current = { kind: 'pan', sx: px, sy: py, axes: { ...axes }, moved: false, open: !panRequested && !hadEditor }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = local(e)
    const d = drag.current
    if (!d) {
      const hit = hitTest(px, py)
      dispatch({ type: 'HOVER', sel: hit ? { sid: hit.sid, rid: hit.rid } : null })
      // anteprima dello snap prima di iniziare un vettore
      if (!hit && active.kind === 'vectors' && state.snap.on && inPlot(px, py) && !e.shiftKey) magnet(px, py)
      else if (mark) setMark(null)
      setCursor(hit ? (hit.part === 'tip' ? 'move' : 'grab') : hitRange(px, py) ? 'ew-resize' : inPlot(px, py) ? 'crosshair' : 'default')
      return
    }
    if (!d.moved && Math.hypot(px - d.sx, py - d.sy) < 4) return
    if (!d.moved) {
      d.moved = true
      if (d.kind !== 'pan') setFrozen(view)
    }
    if (d.kind === 'point') {
      if (display.get(d.sid)?.editable === false) return
      const ser = state.series.find((s) => s.id === d.sid)
      const r = ser?.rows.find((q) => q.id === d.rid)
      if (!r) return
      const [x, y] = ser?.kind === 'vectors' ? magnet(px, py, { sid: d.sid, rid: d.rid }) : world(px, py)
      if (d.part === 'tip') dispatch({ type: 'UPDATE_ROW', sid: d.sid, rid: d.rid, patch: { vx: +(x - r.x).toPrecision(12), vy: +(y - r.y).toPrecision(12) } })
      else dispatch({ type: 'UPDATE_ROW', sid: d.sid, rid: d.rid, patch: { x, y } })
      return
    }
    if (d.kind === 'range') {
      const [x] = world(px, py)
      dispatch({ type: 'SET_FIT', id: active.id, fit: { [d.end]: x } })
      return
    }
    if (d.kind === 'newvec') {
      const [x, y] = magnet(px, py)
      d.ex = x
      d.ey = y
      setPreview({ x0: d.wx, y0: d.wy, x1: x, y1: y })
      return
    }
    // pan
    setCursor('grabbing')
    const a = d.axes
    const sx = (a.xmax - a.xmin) / rect.width
    const sy = (a.ymax - a.ymin) / rect.height
    const dx = (px - d.sx) * sx
    const dy = (py - d.sy) * sy
    dispatch({ type: 'SET_AXES', axes: { auto: false, xmin: a.xmin - dx, xmax: a.xmax - dx, ymin: a.ymin + dy, ymax: a.ymax + dy } })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setFrozen(null)
    setPreview(null)
    setMark(null)
    if (!d) return
    const [px, py] = local(e)
    if (d.kind === 'point' && !d.moved) {
      const ser = state.series.find((s) => s.id === d.sid)
      const r = ser?.rows.find((q) => q.id === d.rid)
      if (r) {
        const { id: _id, ...row } = r
        void _id
        setEditor({ sid: d.sid, rid: r.id, row, sx: px, sy: py })
      }
    }
    if (d.kind === 'pan' && !d.moved && d.open) {
      if (!activeDisplay.editable) {
        setNotice('Sugli assi ci sono colonne calcolate: aggiungi i punti dalla tabella')
        return
      }
      const [x, y] = world(px, py)
      openNew(x, y, px, py)
    }
    if (d.kind === 'newvec') {
      if (d.moved) {
        const last = lastRow()
        dispatch({ type: 'ADD_ROW', sid: active.id, row: { x: d.wx, y: d.wy, vx: +(d.ex - d.wx).toPrecision(12), vy: +(d.ey - d.wy).toPrecision(12), ex: last?.ex ?? 0, ey: last?.ey ?? 0 }, select: true })
      } else openNew(d.wx, d.wy, px, py)
    }
  }

  // rotella: zoom attorno al cursore (Shift = solo x, Alt = solo y)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const [cx, cy] = proj.toWorld(e.clientX - r.left, e.clientY - r.top)
      const f = Math.exp(e.deltaY * 0.0012)
      const fx = e.altKey ? 1 : f
      const fy = e.shiftKey ? 1 : f
      dispatch({
        type: 'SET_AXES',
        axes: { auto: false, xmin: cx - (cx - axes.xmin) * fx, xmax: cx + (axes.xmax - cx) * fx, ymin: cy - (cy - axes.ymin) * fy, ymax: cy + (axes.ymax - cy) * fy },
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [proj, axes, dispatch, canvasRef])

  const editSeries = editor ? state.series.find((s) => s.id === editor.sid) : null

  return (
    <div className="stage__canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage__canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          dispatch({ type: 'HOVER', sel: null })
          if (!drag.current) setMark(null)
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {notice && <div className="stage__hint">{notice}</div>}
      {editor && editSeries && (
        <PlotPointEditor
          key={`${editor.rid}-${editor.sx}-${editor.sy}`}
          target={editor}
          series={editSeries}
          stageW={w}
          stageH={h}
          onClose={() => setEditor(null)}
          onDelete={() => {
            if (editor.rid !== null) dispatch({ type: 'REMOVE_ROW', sid: editor.sid, rid: editor.rid })
            setEditor(null)
          }}
          onSave={(row) => {
            if (editor.rid === null) dispatch({ type: 'ADD_ROW', sid: editor.sid, row, select: true })
            else dispatch({ type: 'UPDATE_ROW', sid: editor.sid, rid: editor.rid, patch: row })
            setEditor(null)
          }}
        />
      )}
    </div>
  )
}
