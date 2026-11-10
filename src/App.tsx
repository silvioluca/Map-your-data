import { useEffect, useLayoutEffect, useState } from 'react'
import { StoreProvider } from './state/store'
import { Toolbar } from './components/Toolbar'
import { Stage } from './components/Stage'
import { DataTable } from './components/DataTable'
import { IconMoon, IconSun } from './components/icons'
import { Segmented } from './components/Segmented'
import { PlotProvider } from './plot/store'
import { PlotView } from './plot/PlotView'
import { StatsProvider } from './stats/store'
import { StatsView } from './stats/StatsView'
import './App.css'

type AppMode = 'plot' | 'field' | 'stats'

function useAppMode(): [AppMode, (m: AppMode) => void] {
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      return (localStorage.getItem('map-your-data-mode') as AppMode | null) ?? 'plot'
    } catch {
      return 'plot'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('map-your-data-mode', mode)
    } catch {
      /* storage non disponibile */
    }
  }, [mode])
  return [mode, setMode]
}

type Theme = 'light' | 'dark'

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('map-your-data-theme') as Theme | null) ?? 'light'
    } catch {
      return 'light'
    }
  })

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('map-your-data-theme', theme)
    } catch {
      /* storage non disponibile */
    }
  }, [theme])

  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))]
}

function Workspace() {
  const [theme, toggleTheme] = useTheme()
  const [mode, setMode] = useAppMode()
  const modeSwitch = (
    <div className="control-bar__group">
      <span className="control-bar__label">Modalità</span>
      <Segmented<AppMode>
        name="app-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'plot', label: 'Grafico', title: 'Punti, vettori e fit sul piano cartesiano' },
          { value: 'field', label: 'Campo', title: 'Mappa di un campo scalare o vettoriale' },
          { value: 'stats', label: 'Statistica', title: 'Misure ripetute: istogramma, media, deviazione standard' },
        ]}
      />
    </div>
  )

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Map your data</h1>
          <p>
            {mode === 'plot'
              ? 'Inserisci punti o vettori sul piano cartesiano o in tabella, con i loro errori, e fai il fit dei dati.'
              : mode === 'stats'
                ? 'Analizza misure ripetute: istogramma, media, deviazione standard ed errore della media.'
                : 'Mappa un campo scalare o vettoriale su un piano, un’immagine o una mappa: linee di campo, divergenza e rotore.'}
          </p>
        </div>
        <button className="btn btn--icon theme-toggle" onClick={toggleTheme} title="Cambia tema">
          {theme === 'light' ? <IconMoon /> : <IconSun />}
        </button>
      </header>

      {mode === 'plot' ? (
        <PlotView themeKey={theme} modeSwitch={modeSwitch} />
      ) : mode === 'stats' ? (
        <StatsView modeSwitch={modeSwitch} />
      ) : (
        <>
          <Toolbar modeSwitch={modeSwitch} />
          <main className="app__main">
            <Stage themeKey={theme} />
            <div className="app__side">
              <DataTable />
            </div>
          </main>
        </>
      )}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <PlotProvider>
        <StatsProvider>
          <Workspace />
        </StatsProvider>
      </PlotProvider>
    </StoreProvider>
  )
}
