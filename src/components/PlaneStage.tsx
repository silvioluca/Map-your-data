import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useSize, setupCanvas } from '../lib/useSize'
import { drawAxes, drawField, drawPoints, hitPoint, planeProjector, readTheme, type Projector } from '../lib/render2d'
import { PointEditor, type EditorTarget } from './PointEditor'
import type { DataPoint } from '../types'

export type ImageTool = 'points' | 'move'

interface Props {
  themeKey: string
  tool: ImageTool
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

type Drag =
  | { kind: 'point'; id: number; sx: number; sy: number; moved: boolean }
  | { kind: 'image'; wx: number; wy: number; x0: number; y0: number }
  | { kind: 'resize'; top: number; left: number }

const HANDLE = 9

export function PlaneStage({ themeKey, tool, canvasRef }: Props) {
  const { state, dispatch, points, grid } = useStore()
  const mode = state.mode === 'image' ? 'image' : 'plane'
  const axes = state.axes[mode]
  const wrapRef = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrapRef)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [cursor, setCursor] = useState('crosshair')
  const drag = useRef<Drag | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const isImage = mode === 'image'
  const moving = isImage && tool === 'move'
  const pl = state.image.placement

  const { proj, rect } = useMemo(() => planeProjector(axes, w, h), [axes, w, h])

  // carica l'immagine
  useEffect(() => {
    if (!isImage || !state.image.src) {
      setImgEl(null)
      return
    }
    const im = new Image()
    im.onload = () => setImgEl(im)
    im.src = state.image.src
  }, [isImage, state.image.src])

  // chiude il popup se il punto non esiste più
  useEffect(() => {
    if (editor?.id != null && !points.some((p) => p.id === editor.id)) setEditor(null)
  }, [points, editor])
  useEffect(() => setEditor(null), [state.mode, state.opts.view, points.length])

  const imageScreenRect = useCallback(
    (pr: Projector) => {
      const [ax, ay] = pr.toScreen(pl.x, pl.y + pl.h)
      const [bx, by] = pr.toScreen(pl.x + pl.w, pl.y)
      return { x: ax, y: ay, w: bx - ax, h: by - ay }
    },
    [pl],
  )

  // ---------- disegno ----------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || w === 0 || h === 0) return
    const ctx = setupCanvas(canvas, w, h)
    const theme = readTheme()
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.left, rect.top, rect.width, rect.height)
    ctx.clip()
    if (imgEl) {
      const r = imageScreenRect(proj)
      ctx.globalAlpha = pl.opacity
      ctx.drawImage(imgEl, r.x, r.y, r.w, r.h)
      ctx.globalAlpha = 1
    }
    if (grid && state.opts.view !== 'surface') drawField(ctx, { grid, opts: state.opts, kind: state.field.kind, proj, theme })
    ctx.restore()

    drawAxes(ctx, axes, proj, rect, theme, !imgEl && !(grid && state.opts.view !== 'vectors'))

    if (imgEl && moving) {
      const r = imageScreenRect(proj)
      ctx.save()
      ctx.strokeStyle = theme.accent
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
      ctx.fillStyle = theme.accent
      ctx.fillRect(r.x + r.w - HANDLE, r.y + r.h - HANDLE, HANDLE * 2, HANDLE * 2)
      ctx.restore()
    }

    if (state.opts.showPoints) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(rect.left - 12, rect.top - 12, rect.width + 24, rect.height + 24)
      ctx.clip()
      drawPoints(ctx, points, state.field.kind, proj, theme, state.selectedId, state.hoverId)
      ctx.restore()
    }

    if (points.length === 0) {
      ctx.save()
      ctx.font = '12px ui-monospace, Consolas, monospace'
      ctx.fillStyle = theme.text
      ctx.textAlign = 'center'
      const msg = moving ? 'Trascina l’immagine per spostarla · quadratino o rotella per ridimensionarla' : 'Clicca sul piano per aggiungere un punto, oppure compila la tabella'
      const tw = ctx.measureText(msg).width + 20
      ctx.fillStyle = theme.bg
      ctx.globalAlpha = 0.85
      ctx.fillRect(rect.left + rect.width / 2 - tw / 2, rect.top + 12, tw, 24)
      ctx.globalAlpha = 1
      ctx.fillStyle = theme.textH
      ctx.textBaseline = 'middle'
      ctx.fillText(msg, rect.left + rect.width / 2, rect.top + 24)
      ctx.restore()
    }
  }, [w, h, proj, rect, axes, grid, state.opts, state.field.kind, points, state.selectedId, state.hoverId, imgEl, pl, moving, themeKey, imageScreenRect, canvasRef])

  // ---------- interazione ----------
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const inPlot = (px: number, py: number) => px >= rect.left && px <= rect.left + rect.width && py >= rect.top && py <= rect.top + rect.height

  const onImageHandle = (px: number, py: number) => {
    if (!imgEl) return false
    const r = imageScreenRect(proj)
    return Math.abs(px - (r.x + r.w)) <= HANDLE + 2 && Math.abs(py - (r.y + r.h)) <= HANDLE + 2
  }
  const onImage = (px: number, py: number) => {
    if (!imgEl) return false
    const r = imageScreenRect(proj)
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
  }

  const defaults = (): Pick<DataPoint, 's' | 'u' | 'v'> => {
    const last = points[points.length - 1]
    return last ? { s: last.s, u: last.u, v: last.v } : { s: 0, u: 1, v: 0 }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const [px, py] = local(e)
    if (moving) {
      if (onImageHandle(px, py)) {
        drag.current = { kind: 'resize', left: pl.x, top: pl.y + pl.h }
      } else if (onImage(px, py)) {
        const [wx, wy] = proj.toWorld(px, py)
        drag.current = { kind: 'image', wx, wy, x0: pl.x, y0: pl.y }
      } else return
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    const hit = hitPoint(points, proj, px, py)
    if (hit) {
      drag.current = { kind: 'point', id: hit.id, sx: px, sy: py, moved: false }
      dispatch({ type: 'SELECT', id: hit.id })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    if (editor) {
      setEditor(null)
      return
    }
    if (!inPlot(px, py)) return
    const [x, y] = proj.toWorld(px, py)
    setEditor({ id: null, point: { x, y, ...defaults() }, sx: px, sy: py })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = local(e)
    const d = drag.current
    if (d?.kind === 'point') {
      if (!d.moved && Math.hypot(px - d.sx, py - d.sy) < 4) return
      d.moved = true
      setEditor(null)
      const [x, y] = proj.toWorld(Math.max(rect.left, Math.min(rect.left + rect.width, px)), Math.max(rect.top, Math.min(rect.top + rect.height, py)))
      dispatch({ type: 'UPDATE_POINT', id: d.id, patch: { x, y } })
      return
    }
    if (d?.kind === 'image') {
      const [wx, wy] = proj.toWorld(px, py)
      dispatch({ type: 'SET_PLACEMENT', placement: { x: d.x0 + wx - d.wx, y: d.y0 + wy - d.wy } })
      return
    }
    if (d?.kind === 'resize') {
      const [wx, wy] = proj.toWorld(px, py)
      const ratio = state.image.naturalH / state.image.naturalW || 1
      const nw = Math.max((axes.xmax - axes.xmin) * 0.02, wx - d.left)
      const nh = pl.lockAspect ? nw * ratio : Math.max((axes.ymax - axes.ymin) * 0.02, d.top - wy)
      dispatch({ type: 'SET_PLACEMENT', placement: { x: d.left, y: d.top - nh, w: nw, h: nh } })
      return
    }
    // hover
    if (moving) {
      setCursor(onImageHandle(px, py) ? 'nwse-resize' : onImage(px, py) ? 'move' : 'default')
      return
    }
    const hit = hitPoint(points, proj, px, py)
    dispatch({ type: 'HOVER', id: hit?.id ?? null })
    setCursor(hit ? 'grab' : inPlot(px, py) ? 'crosshair' : 'default')
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'point' && !d.moved) {
      const p = points.find((q) => q.id === d.id)
      if (p) {
        const [sx, sy] = local(e)
        const { id: _id, ...rest } = p
        void _id
        setEditor({ id: p.id, point: rest, sx, sy })
      }
    }
  }

  // rotella: ridimensiona l'immagine attorno al cursore
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !moving || !imgEl) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const [cx, cy] = proj.toWorld(e.clientX - r.left, e.clientY - r.top)
      const f = Math.exp(-e.deltaY * 0.0012)
      dispatch({ type: 'SET_PLACEMENT', placement: { x: cx - (cx - pl.x) * f, y: cy - (cy - pl.y) * f, w: pl.w * f, h: pl.h * f } })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [moving, imgEl, proj, pl, dispatch, canvasRef])

  return (
    <div className="stage__canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage__canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => dispatch({ type: 'HOVER', id: null })}
      />
      {editor && (
        <PointEditor
          key={`${editor.id}-${editor.sx}-${editor.sy}`}
          target={editor}
          field={state.field}
          mode={state.mode}
          stageW={w}
          stageH={h}
          onClose={() => setEditor(null)}
          onDelete={() => {
            if (editor.id !== null) dispatch({ type: 'REMOVE_POINT', id: editor.id })
            setEditor(null)
          }}
          onSave={(p) => {
            if (editor.id === null) dispatch({ type: 'ADD_POINT', point: p, select: true })
            else dispatch({ type: 'UPDATE_POINT', id: editor.id, patch: p })
            setEditor(null)
          }}
        />
      )}
    </div>
  )
}
