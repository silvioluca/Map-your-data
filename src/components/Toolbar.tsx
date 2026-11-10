import type { ReactNode } from 'react'
import { useStore } from '../state/store'
import { COLORMAP_LABELS } from '../lib/colormaps'
import { Segmented } from './Segmented'
import { NumField } from './NumField'
import type { ColormapName, Interp, Mode } from '../types'

export function Toolbar({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { state, dispatch } = useStore()
  const { opts, field } = state
  const set = (o: Partial<typeof opts>) => dispatch({ type: 'SET_OPTS', opts: o })

  return (
    <div className="control-bar">
      {modeSwitch}

      <div className="control-bar__group">
        <span className="control-bar__label">Sfondo</span>
        <Segmented<Mode>
          name="mode"
          value={state.mode}
          onChange={(mode) => dispatch({ type: 'SET_MODE', mode })}
          options={[
            { value: 'plane', label: 'Piano', title: 'Piano cartesiano' },
            { value: 'image', label: 'Immagine', title: 'Immagine di sfondo con assi personalizzabili' },
            { value: 'map', label: 'Mappa', title: 'Mappa geografica (OpenStreetMap)' },
          ]}
        />
      </div>

      <div className="control-bar__group">
        <span className="control-bar__label">Campo</span>
        <Segmented
          name="kind"
          value={field.kind}
          onChange={(kind) => dispatch({ type: 'SET_FIELD', field: { kind } })}
          options={[
            { value: 'scalar', label: 'Scalare' },
            { value: 'vector', label: 'Vettoriale' },
          ]}
        />
        <label className="control-bar__field">
          nome
          <input type="text" value={field.name} onChange={(e) => dispatch({ type: 'SET_FIELD', field: { name: e.target.value } })} style={{ width: 56 }} />
        </label>
        <label className="control-bar__field">
          unità
          <input type="text" value={field.unit} onChange={(e) => dispatch({ type: 'SET_FIELD', field: { unit: e.target.value } })} style={{ width: 56 }} />
        </label>
      </div>

      <details className="advanced">
        <summary>Impostazioni avanzate</summary>
        <div className="advanced__body">
          <fieldset className="advanced__section">
            <legend>Interpolazione</legend>
            <label className="advanced__select">
              <span>Metodo</span>
              <select value={opts.interp} onChange={(e) => set({ interp: e.target.value as Interp })}>
                <option value="tps">Spline (thin-plate)</option>
                <option value="idw">Inverso della distanza (IDW)</option>
                <option value="nearest">Punto più vicino</option>
              </select>
            </label>
            {opts.interp === 'idw' && (
              <Slider label="Esponente IDW" value={opts.idwPower} min={1} max={6} step={0.5} onChange={(idwPower) => set({ idwPower })} />
            )}
            <Slider label="Risoluzione griglia" value={opts.resolution} min={30} max={240} step={10} onChange={(resolution) => set({ resolution })} />
            <label className="advanced__toggle">
              <input type="checkbox" checked={opts.clipHull} onChange={(e) => set({ clipHull: e.target.checked })} />
              <span>Solo dentro l’area dei punti (inviluppo convesso)</span>
            </label>
            <small>La spline passa per tutti i punti ed è liscia, ma può superare i valori misurati; IDW resta sempre tra min e max.</small>
          </fieldset>

          <fieldset className="advanced__section">
            <legend>Aspetto</legend>
            <label className="advanced__select">
              <span>Colori</span>
              <select value={opts.colormap} onChange={(e) => set({ colormap: e.target.value as ColormapName })}>
                {(Object.keys(COLORMAP_LABELS) as ColormapName[]).map((k) => (
                  <option key={k} value={k}>
                    {COLORMAP_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <Slider label="Opacità del campo" value={opts.opacity} min={0.1} max={1} step={0.05} onChange={(opacity) => set({ opacity })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Numero di isolinee" value={opts.levels} min={2} max={30} step={1} onChange={(levels) => set({ levels })} />
            <label className="advanced__toggle">
              <input type="checkbox" checked={opts.fillContours} onChange={(e) => set({ fillContours: e.target.checked })} />
              <span>Isolinee riempite a bande</span>
            </label>
            <label className="advanced__toggle">
              <input type="checkbox" checked={opts.showPoints} onChange={(e) => set({ showPoints: e.target.checked })} />
              <span>Mostra i punti misurati</span>
            </label>
          </fieldset>

          <fieldset className="advanced__section">
            <legend>Scala dei colori</legend>
            <label className="advanced__toggle">
              <input type="checkbox" checked={opts.autoRange} onChange={(e) => set({ autoRange: e.target.checked })} />
              <span>Automatica (min e max del campo)</span>
            </label>
            <div className="advanced__pair">
              <label className="control-bar__field">
                min
                <NumField disabled={opts.autoRange} value={opts.vmin} onChange={(vmin) => set({ vmin })} />
              </label>
              <label className="control-bar__field">
                max
                <NumField disabled={opts.autoRange} value={opts.vmax} onChange={(vmax) => set({ vmax })} />
              </label>
            </div>
            <small>Con una scala fissa si possono confrontare mappe diverse con gli stessi colori.</small>
          </fieldset>
        </div>
      </details>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="advanced__slider">
      <span className="advanced__slider-head">
        {label}
        <output>{format(value)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}
