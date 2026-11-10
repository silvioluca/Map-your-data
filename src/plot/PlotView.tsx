import { useRef, type ReactNode } from 'react'
import { usePlot } from './store'
import { PlotStage } from './PlotStage'
import { PlotTable } from './PlotTable'
import { FitPanel } from './FitPanel'
import { VectorOps } from './VectorOps'
import { PlotToolbar } from './PlotToolbar'
import { NumField } from '../components/NumField'

export function PlotView({ themeKey, modeSwitch }: { themeKey: string; modeSwitch: ReactNode }) {
  const { state, dispatch, view, active } = usePlot()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ax = state.axes
  const setAxes = (a: Partial<typeof ax>) => dispatch({ type: 'SET_AXES', axes: a })
  // modificare un limite a mano spegne l'adattamento automatico
  const setLimit = (a: Partial<typeof ax>) => setAxes({ ...view, ...a, xlabel: ax.xlabel, ylabel: ax.ylabel, auto: false })

  const exportPng = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'grafico.png'
    a.click()
  }

  return (
    <>
    <PlotToolbar modeSwitch={modeSwitch} />
    <main className="app__main">
      <div className="stage">
        <div className="main-graph__header">
          <span className="main-graph__title">Piano cartesiano</span>
          <div className="main-graph__header-controls">
            <button className={`graphs__download${ax.auto ? ' graphs__download--active' : ''}`} onClick={() => setAxes({ auto: true })} title="Adatta gli assi ai dati">
              Adatta
            </button>
            <button className="graphs__download" onClick={exportPng} title="Scarica il grafico come immagine">
              PNG
            </button>
          </div>
        </div>
        <div className="stage__body">
          <div className="stage__view">
            <PlotStage themeKey={themeKey} canvasRef={canvasRef} />
          </div>
        </div>
        <p className="stage__help">
          {active.kind === 'vectors'
            ? 'Trascina: nuovo vettore · trascina la punta: modificalo · Shift+trascina: sposta la vista · rotella: zoom'
            : 'Clic: nuovo punto · clic su un punto: modificalo · trascina: sposta · trascina il vuoto: sposta la vista · rotella: zoom'}
        </p>
        <div className="stage__settings">
          <div className="stage__settings-group">
            <span className="control-bar__label">Assi</span>
            <label className="control-bar__field">
              x
              <NumField value={view.xmin} onChange={(xmin) => setLimit({ xmin })} width={68} />…
              <NumField value={view.xmax} onChange={(xmax) => setLimit({ xmax })} width={68} />
            </label>
            <label className="control-bar__field">
              y
              <NumField value={view.ymin} onChange={(ymin) => setLimit({ ymin })} width={68} />…
              <NumField value={view.ymax} onChange={(ymax) => setLimit({ ymax })} width={68} />
            </label>
            <label className="control-bar__field" title="Vuoto = nome della colonna">
              etichette
              <input type="text" value={ax.xlabel} placeholder={active.headers.x} onChange={(e) => setAxes({ xlabel: e.target.value })} style={{ width: 80 }} />
              <input type="text" value={ax.ylabel} placeholder={active.headers.y} onChange={(e) => setAxes({ ylabel: e.target.value })} style={{ width: 80 }} />
            </label>
          </div>
        </div>
      </div>
      <div className="app__side">
        <PlotTable />
        {active.kind === 'points' ? <FitPanel /> : <VectorOps />}
      </div>
    </main>
    </>
  )
}
