import type { ReactNode } from 'react'
import { usePlot } from './store'
import { Segmented } from '../components/Segmented'
import type { Series, SeriesKind } from './types'

/** Barra di controllo del grafico: stessa struttura di quella del campo. */
export function PlotToolbar({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { state, dispatch, active } = usePlot()
  const upd = (patch: Partial<Omit<Series, 'id' | 'rows'>>) => dispatch({ type: 'UPDATE_SERIES', id: active.id, patch })

  return (
    <div className="control-bar">
      {modeSwitch}

      <div className="control-bar__group">
        <span className="control-bar__label">Serie</span>
        <span className="series-picker">
          <span className="object-chip__dot" style={{ background: active.color, opacity: active.visible ? 1 : 0.3 }} />
          <select value={active.id} onChange={(e) => dispatch({ type: 'SET_ACTIVE', id: +e.target.value })} title="Serie attiva">
            {state.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || 'senza nome'} ({s.rows.length})
              </option>
            ))}
          </select>
        </span>
        <button className="graphs__download icon-btn" onClick={() => dispatch({ type: 'ADD_SERIES', kind: active.kind })} title="Aggiungi una nuova serie di dati">
          +
        </button>
        <button className="graphs__download icon-btn" disabled={state.series.length <= 1} onClick={() => dispatch({ type: 'REMOVE_SERIES', id: active.id })} title="Elimina la serie attiva">
          ✕
        </button>
      </div>

      <div className="control-bar__group">
        <span className="control-bar__label">Aspetto</span>
        <label className="control-bar__field">
          nome
          <input type="text" value={active.name} onChange={(e) => upd({ name: e.target.value })} style={{ width: 96 }} />
        </label>
        <label className="control-bar__field" title="Colore della serie">
          colore
          <input type="color" className="color-input" value={active.color} onChange={(e) => upd({ color: e.target.value })} />
        </label>
        <Segmented<SeriesKind>
          name={`kind-${active.id}`}
          value={active.kind}
          onChange={(kind) => upd({ kind })}
          options={[
            { value: 'points', label: 'Punti' },
            { value: 'vectors', label: 'Vettori' },
          ]}
        />
      </div>

      <details className="advanced">
        <summary>Impostazioni avanzate</summary>
        <div className="advanced__body">
          <fieldset className="advanced__section">
            <legend>Vista</legend>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.axes.grid} onChange={(e) => dispatch({ type: 'SET_AXES', axes: { grid: e.target.checked } })} />
              <span>Griglia</span>
            </label>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.showErrors} onChange={(e) => dispatch({ type: 'SET_SHOW_ERRORS', value: e.target.checked })} />
              <span>Barre d’errore</span>
            </label>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.axes.equal} onChange={(e) => dispatch({ type: 'SET_AXES', axes: { equal: e.target.checked } })} />
              <span>Scala 1:1 (stessa unità su x e y, utile per i vettori)</span>
            </label>
          </fieldset>
          <fieldset className="advanced__section">
            <legend>Snap magnetico (vettori)</legend>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.snap.on} onChange={(e) => dispatch({ type: 'SET_SNAP', snap: { on: e.target.checked } })} />
              <span>
                Attivo
                <small>Disegnando o spostando un vettore, il cursore si aggancia quando è vicino a un riferimento.</small>
              </span>
            </label>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.snap.ends} disabled={!state.snap.on} onChange={(e) => dispatch({ type: 'SET_SNAP', snap: { ends: e.target.checked } })} />
              <span>Alle code e alle punte degli altri vettori</span>
            </label>
            <label className="advanced__toggle">
              <input type="checkbox" checked={state.snap.grid} disabled={!state.snap.on} onChange={(e) => dispatch({ type: 'SET_SNAP', snap: { grid: e.target.checked } })} />
              <span>Alla griglia (linee e mezze linee)</span>
            </label>
          </fieldset>
          <fieldset className="advanced__section">
            <legend>Serie attiva</legend>
            <label className="advanced__toggle">
              <input type="checkbox" checked={active.visible} onChange={(e) => upd({ visible: e.target.checked })} />
              <span>Visibile sul grafico</span>
            </label>
            <label className="advanced__toggle">
              <input type="checkbox" checked={active.connect} disabled={active.kind !== 'points'} onChange={(e) => upd({ connect: e.target.checked })} />
              <span>Unisci i punti con una spezzata</span>
            </label>
          </fieldset>
        </div>
      </details>
    </div>
  )
}
