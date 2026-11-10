import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useStore } from '../state/store'
import { setupCanvas, useSize } from '../lib/useSize'
import { drawField, drawPoints, hitPoint, readTheme, type Projector } from '../lib/render2d'
import { PointEditor, type EditorTarget } from './PointEditor'

interface Props {
  themeKey: string
}

/** Mappa OpenStreetMap con il campo disegnato sopra. Coordinate: x = longitudine, y = latitudine. */
export function MapStage({ themeKey }: Props) {
  const { state, dispatch, points, grid } = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapDiv = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const { w, h } = useSize(wrapRef)
  const [tick, setTick] = useState(0)
  const [editor, setEditor] = useState<EditorTarget | null>(null)

  // i gestori Leaflet leggono sempre lo stato più recente
  const live = useRef({ points, state, editor })
  live.current = { points, state, editor }
  const dragId = useRef<number | null>(null)
  const justDragged = useRef(false)

  const projector = (): Projector | null => {
    const m = mapRef.current
    if (!m) return null
    return {
      toScreen: (x, y) => {
        const p = m.latLngToContainerPoint([y, x])
        return [p.x, p.y]
      },
      toWorld: (px, py) => {
        const ll = m.containerPointToLatLng([px, py])
        return [ll.lng, ll.lat]
      },
      // Mercatore è conforme: est → destra, nord → su
      dir: (u, v) => [u, -v],
    }
  }

  // crea la mappa una volta sola
  useEffect(() => {
    if (!mapDiv.current) return
    const { lat, lng, zoom } = live.current.state.map
    const m = L.map(mapDiv.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    mapRef.current = m
    // il canvas sta dentro il contenitore Leaflet: sopra le tessere, sotto i controlli
    const overlay = document.createElement('canvas')
    overlay.className = 'stage__overlay'
    m.getContainer().appendChild(overlay)
    canvasRef.current = overlay

    const redraw = () => setTick((t) => t + 1)
    m.on('move zoom resize', redraw)
    m.on('moveend', () => {
      const c = m.getCenter()
      dispatch({ type: 'SET_MAP', map: { lat: c.lat, lng: c.lng, zoom: m.getZoom() } })
    })

    const pr = () => projector()!
    m.on('mousedown', (e: L.LeafletMouseEvent) => {
      const hit = hitPoint(live.current.points, pr(), e.containerPoint.x, e.containerPoint.y)
      if (hit) {
        dragId.current = hit.id
        justDragged.current = false
        m.dragging.disable()
        dispatch({ type: 'SELECT', id: hit.id })
      }
    })
    m.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (dragId.current !== null) {
        justDragged.current = true
        setEditor(null)
        dispatch({ type: 'UPDATE_POINT', id: dragId.current, patch: { x: e.latlng.lng, y: e.latlng.lat } })
        return
      }
      const hit = hitPoint(live.current.points, pr(), e.containerPoint.x, e.containerPoint.y)
      dispatch({ type: 'HOVER', id: hit?.id ?? null })
      m.getContainer().style.cursor = hit ? 'grab' : 'crosshair'
    })
    const endDrag = () => {
      if (dragId.current !== null) {
        dragId.current = null
        m.dragging.enable()
      }
    }
    m.on('mouseup', endDrag)
    m.on('mouseout', endDrag)
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (justDragged.current) {
        justDragged.current = false
        return
      }
      const { points: pts, editor: ed } = live.current
      const { x, y } = e.containerPoint
      const hit = hitPoint(pts, pr(), x, y)
      if (hit) {
        const { id: _id, ...rest } = hit
        void _id
        setEditor({ id: hit.id, point: rest, sx: x, sy: y })
        return
      }
      if (ed) {
        setEditor(null)
        return
      }
      const last = pts[pts.length - 1]
      const vals = last ? { s: last.s, u: last.u, v: last.v } : { s: 0, u: 1, v: 0 }
      setEditor({ id: null, point: { x: e.latlng.lng, y: e.latlng.lat, ...vals }, sx: x, sy: y })
    })

    return () => {
      m.remove()
      overlay.remove()
      mapRef.current = null
      canvasRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mapRef.current?.invalidateSize()
  }, [w, h])

  // "Centra sui punti" dalla toolbar
  useEffect(() => {
    const onFit = () => {
      const m = mapRef.current
      const pts = live.current.points
      if (!m || pts.length === 0) return
      if (pts.length === 1) m.setView([pts[0].y, pts[0].x], Math.max(m.getZoom(), 12))
      else m.fitBounds(L.latLngBounds(pts.map((p) => [p.y, p.x] as [number, number])), { padding: [40, 40] })
    }
    window.addEventListener('myd-fit-map', onFit)
    return () => window.removeEventListener('myd-fit-map', onFit)
  }, [])

  useEffect(() => {
    if (editor?.id != null && !points.some((p) => p.id === editor.id)) setEditor(null)
  }, [points, editor])

  // disegno dell'overlay
  useEffect(() => {
    const canvas = canvasRef.current
    const proj = projector()
    if (!canvas || !proj || w === 0) return
    const ctx = setupCanvas(canvas, w, h)
    const theme = readTheme()
    if (grid && state.opts.view !== 'surface') drawField(ctx, { grid, opts: state.opts, kind: state.field.kind, proj, theme })
    if (state.opts.showPoints) drawPoints(ctx, points, state.field.kind, proj, theme, state.selectedId, state.hoverId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, w, h, grid, state.opts, state.field.kind, points, state.selectedId, state.hoverId, themeKey])

  return (
    <div className="stage__canvas-wrap stage__canvas-wrap--map" ref={wrapRef}>
      <div ref={mapDiv} className="stage__map" />
      {points.length === 0 && <div className="stage__hint">Clicca sulla mappa per aggiungere un punto</div>}
      {editor && (
        <PointEditor
          key={`${editor.id}-${editor.sx}-${editor.sy}`}
          target={editor}
          field={state.field}
          mode="map"
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
