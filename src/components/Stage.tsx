import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { PlaneStage, type ImageTool } from './PlaneStage'
import { MapStage } from './MapStage'
import { Surface3D } from './Surface3D'
import { ColorBar } from './ColorBar'
import { Segmented } from './Segmented'
import { NumField } from './NumField'
import type { ViewKind } from '../types'
import { quantityOptions, type Quantity } from '../lib/fieldlines'

const VIEW_TITLES = {
  color: 'Mappa a colori',
  vectors: 'Mappa vettoriale',
  lines: 'Linee di campo',
  contour: 'Isolinee',
  surface: 'Superficie 3D',
}

export function Stage({ themeKey }: { themeKey: string }) {
  const { state, dispatch, grid } = useStore()
  const [tool, setTool] = useState<ImageTool>('points')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { mode, opts, field } = state
  const is3d = opts.view === 'surface'

  const qOpt = quantityOptions(field.kind, field.name).find((o) => o.value === opts.quantity)
  const base = opts.view === 'vectors' && field.kind === 'scalar' ? `Gradiente ∇${field.name || 'f'}` : opts.view === 'lines' && field.kind === 'scalar' ? 'Linee del gradiente' : VIEW_TITLES[opts.view]
  const title = qOpt && qOpt.value !== 'value' && opts.view !== 'vectors' ? `${base} · ${qOpt.label}` : base

  const exportPng = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `map-your-data-${opts.view}.png`
    a.click()
  }

  const loadImage = (f: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const im = new Image()
      im.onload = () => {
        dispatch({ type: 'SET_IMAGE', src, name: f.name, naturalW: im.naturalWidth, naturalH: im.naturalHeight })
        setTool('points')
      }
      im.src = src
    }
    reader.readAsDataURL(f)
  }

  const axes = mode === 'map' ? null : state.axes[mode]
  const setAxes = (a: Partial<NonNullable<typeof axes>>) => dispatch({ type: 'SET_AXES', axes: a })
  const pl = state.image.placement
  const setPl = (p: Partial<typeof pl>) => dispatch({ type: 'SET_PLACEMENT', placement: p })

  return (
    <div className="stage">
      <div className="main-graph__header">
        <span className="main-graph__title">{title}</span>
        <div className="main-graph__header-controls">
          <select
            className="stage__quantity"
            value={quantityOptions(field.kind, field.name).some((o) => o.value === opts.quantity) ? opts.quantity : 'value'}
            onChange={(e) => dispatch({ type: 'SET_OPTS', opts: { quantity: e.target.value as Quantity } })}
            title="Grandezza mostrata da colori, isolinee e 3D"
          >
            {quantityOptions(field.kind, field.name).map((o) => (
              <option key={o.value} value={o.value} title={o.title}>
                {o.label}
              </option>
            ))}
          </select>
          <Segmented<ViewKind>
            name="view"
            value={opts.view}
            onChange={(view) => dispatch({ type: 'SET_OPTS', opts: { view } })}
            options={[
              { value: 'color', label: 'Colore', title: 'Mappa a colori' },
              { value: 'vectors', label: 'Vettori', title: field.kind === 'scalar' ? 'Gradiente del campo scalare' : 'Campo vettoriale' },
              { value: 'lines', label: 'Linee', title: field.kind === 'scalar' ? 'Linee del gradiente' : 'Linee di campo' },
              { value: 'contour', label: 'Isolinee', title: 'Contour plot' },
              { value: 'surface', label: '3D', title: 'Superficie 3D' },
            ]}
          />
          {mode === 'map' && !is3d && (
            <button className="graphs__download" onClick={() => window.dispatchEvent(new Event('myd-fit-map'))} disabled={state.points.map.length === 0}>
              Centra sui punti
            </button>
          )}
          {(mode !== 'map' || is3d) && (
            <button className="graphs__download" onClick={exportPng} title="Scarica l’immagine del grafico">
              PNG
            </button>
          )}
        </div>
      </div>

      <div className="stage__body">
        <div className="stage__view">
          {is3d ? (
            <Surface3D themeKey={themeKey} canvasRef={canvasRef} />
          ) : mode === 'map' ? (
            <MapStage themeKey={themeKey} />
          ) : (
            <PlaneStage themeKey={themeKey} tool={tool} canvasRef={canvasRef} />
          )}
        </div>
        {grid && <ColorBar />}
      </div>
      <p className="stage__help">
        {is3d
          ? 'Trascina: ruota · rotella: zoom'
          : opts.view === 'lines'
            ? 'Le linee seguono la direzione del campo, la freccia ne indica il verso · clic: nuovo punto · trascina: sposta'
          : mode === 'map'
            ? 'Clic: nuovo punto · clic su un punto: modificalo · trascina: sposta · trascina il vuoto: sposta la mappa'
            : mode === 'image' && tool === 'move'
              ? 'Trascina: sposta l’immagine · quadratino o rotella: ridimensiona'
              : 'Clic: nuovo punto · clic su un punto: modificalo · trascina: sposta'}
      </p>

      {axes && !is3d && (
        <div className="stage__settings">
          <div className="stage__settings-group">
            <span className="control-bar__label">Assi</span>
            <label className="control-bar__field">
              {axes.xlabel || 'x'}
              <NumField value={axes.xmin} onChange={(xmin) => setAxes({ xmin })} width={64} />
              …
              <NumField value={axes.xmax} onChange={(xmax) => setAxes({ xmax })} width={64} />
            </label>
            <label className="control-bar__field">
              {axes.ylabel || 'y'}
              <NumField value={axes.ymin} onChange={(ymin) => setAxes({ ymin })} width={64} />
              …
              <NumField value={axes.ymax} onChange={(ymax) => setAxes({ ymax })} width={64} />
            </label>
            <label className="control-bar__field" title="Nomi degli assi (con unità)">
              etichette
              <input type="text" value={axes.xlabel} onChange={(e) => setAxes({ xlabel: e.target.value })} style={{ width: 64 }} />
              <input type="text" value={axes.ylabel} onChange={(e) => setAxes({ ylabel: e.target.value })} style={{ width: 64 }} />
            </label>
            <label className="advanced__toggle" title="Stessa scala sui due assi">
              <input type="checkbox" checked={axes.equal} onChange={(e) => setAxes({ equal: e.target.checked })} />
              <span>Scala 1:1</span>
            </label>
          </div>

          {mode === 'image' && (
            <div className="stage__settings-group">
              <span className="control-bar__label">Immagine</span>
              <button className="graphs__download graphs__download--active" onClick={() => fileRef.current?.click()}>
                {state.image.src ? 'Cambia…' : 'Carica immagine…'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) loadImage(f)
                  e.target.value = ''
                }}
              />
              {state.image.src && (
                <>
                  <Segmented<ImageTool>
                    name="tool"
                    value={tool}
                    onChange={setTool}
                    options={[
                      { value: 'points', label: 'Punti', title: 'Clicca per aggiungere o modificare punti' },
                      { value: 'move', label: 'Sposta immagine', title: 'Trascina per spostare, quadratino o rotella per ridimensionare' },
                    ]}
                  />
                  <label className="control-bar__field" title="Angolo in basso a sinistra">
                    origine
                    <NumField value={pl.x} onChange={(x) => setPl({ x })} width={60} />
                    <NumField value={pl.y} onChange={(y) => setPl({ y })} width={60} />
                  </label>
                  <label className="control-bar__field">
                    dimensioni
                    <NumField value={pl.w} onChange={(w) => w > 0 && setPl({ w })} width={60} />
                    ×
                    <NumField value={pl.h} onChange={(h) => h > 0 && setPl({ h })} width={60} />
                  </label>
                  <label className="advanced__toggle">
                    <input type="checkbox" checked={pl.lockAspect} onChange={(e) => setPl({ lockAspect: e.target.checked })} />
                    <span>Proporzioni</span>
                  </label>
                  <label className="control-bar__field">
                    opacità
                    <input type="range" min={0.1} max={1} step={0.05} value={pl.opacity} onChange={(e) => setPl({ opacity: +e.target.value })} />
                  </label>
                  <button className="graphs__download" onClick={() => dispatch({ type: 'FIT_AXES_TO_IMAGE' })} title="Gli assi coprono esattamente l’immagine">
                    Assi = immagine
                  </button>
                  <button className="graphs__download" onClick={() => dispatch({ type: 'REMOVE_IMAGE' })}>
                    Rimuovi
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
