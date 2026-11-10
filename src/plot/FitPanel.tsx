import { useMemo, useState } from 'react'
import { usePlot } from './store'
import { formatPM, formulaParams, inFitRange, MODEL_LABELS, type FitModel } from './fit'
import { NumField } from '../components/NumField'
import { Residuals } from './Residuals'

const MODELS: FitModel[] = ['none', 'linear', 'poly', 'exp', 'log', 'power', 'sin', 'gauss', 'custom']

const HINTS: Partial<Record<FitModel, string>> = {
  linear: 'y = a + b·x',
  poly: 'polinomio di grado n',
  exp: 'y = A·e^(B·x)',
  log: 'y = a + b·ln(x), solo x > 0',
  power: 'y = A·xⁿ, solo x > 0',
  sin: 'y = A·sin(ω·x + φ) + C',
  gauss: 'y = A·e^(−(x−μ)²/2σ²)',
  custom: 'scrivi tu la funzione di x',
}

export function FitPanel() {
  const { dispatch, active, fits, activeDisplay } = usePlot()
  const [copied, setCopied] = useState(false)
  const [resMode, setResMode] = useState<'abs' | 'norm'>('abs')
  const cfg = active.fit
  const res = fits.get(active.id)
  const set = (f: Partial<typeof cfg>) => dispatch({ type: 'SET_FIT', id: active.id, fit: f })
  const rows = activeDisplay.ser.rows
  const hasErrors = rows.some((r) => r.ey > 0 || r.ex > 0)
  const inRange = useMemo(() => rows.filter((r) => inFitRange(cfg, r.x)), [rows, cfg])

  // parametri della formula libera (se la formula si legge)
  let customParams: string[] = []
  let customError: string | null = null
  if (cfg.model === 'custom') {
    try {
      customParams = formulaParams(cfg.formula)
    } catch (e) {
      customError = (e as Error).message
    }
  }

  const copy = async () => {
    if (!res?.ok) return
    const lines = [
      `${active.name} — fit ${MODEL_LABELS[cfg.model].toLowerCase()}: ${res.formula}`,
      ...res.params.map((p) => `${p.name} = ${formatPM(p.value, p.err)}`),
      res.weighted ? `χ² = ${res.chi2.toPrecision(4)}, gradi di libertà = ${res.dof}, χ²/ν = ${res.chi2red.toPrecision(3)}` : `fit non pesato, gradi di libertà = ${res.dof}`,
      `R² = ${res.r2.toFixed(5)}`,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* appunti non disponibili */
    }
  }

  return (
    <div className="data-table-panel fit-panel">
      <div className="data-table__header">
        <span className="main-graph__title">
          Fit <span style={{ color: active.color }}>· {active.name}</span>
        </span>
        {res?.ok && (
          <button className="graphs__download" onClick={copy}>
            {copied ? 'Copiato' : 'Copia'}
          </button>
        )}
      </div>

      <div className="fit-panel__controls">
        <label className="advanced__select fit-panel__model">
          <span>Modello</span>
          <select value={cfg.model} onChange={(e) => set({ model: e.target.value as FitModel })}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m]}
                {HINTS[m] ? ` — ${HINTS[m]}` : ''}
              </option>
            ))}
          </select>
        </label>
        {cfg.model === 'poly' && (
          <label className="control-bar__field">
            grado
            <span className="stepper">
              <button className="graphs__download" onClick={() => set({ degree: Math.max(2, cfg.degree - 1) })} disabled={cfg.degree <= 2}>
                −
              </button>
              <b>{cfg.degree}</b>
              <button className="graphs__download" onClick={() => set({ degree: Math.min(8, cfg.degree + 1) })} disabled={cfg.degree >= 8}>
                +
              </button>
            </span>
          </label>
        )}
        {(cfg.model === 'exp' || cfg.model === 'gauss') && (
          <label className="advanced__toggle">
            <input type="checkbox" checked={cfg.expOffset} onChange={(e) => set({ expOffset: e.target.checked })} />
            <span>Con costante C</span>
          </label>
        )}
        {cfg.model !== 'none' && (
          <label className="advanced__toggle" title="Pesa ogni punto con 1/σ²; con σx si usa la varianza efficace">
            <input type="checkbox" checked={cfg.useErrors} onChange={(e) => set({ useErrors: e.target.checked })} disabled={!hasErrors} />
            <span>Pesa con gli errori</span>
          </label>
        )}
      </div>

      {cfg.model === 'custom' && (
        <div className="fit-panel__custom">
          <label className="report__field">
            y =
            <input className="modal__formula" value={cfg.formula} onChange={(e) => set({ formula: e.target.value })} placeholder="es. A*exp(-x/tau) + C" spellCheck={false} />
          </label>
          {customError ? (
            <p className="fit-panel__note fit-panel__note--warn">Formula non valida: {customError}</p>
          ) : (
            customParams.length > 0 && (
              <div className="fit-panel__p0">
                <span className="fit-panel__hint">valori iniziali</span>
                {customParams.map((n) => (
                  <label key={n} className="control-bar__field">
                    {n}
                    <NumField value={cfg.p0[n] ?? 1} onChange={(v) => set({ p0: { ...cfg.p0, [n]: v } })} width={60} />
                  </label>
                ))}
                {res?.ok && (
                  <button
                    className="graphs__download"
                    title="Riparti dal risultato del fit"
                    onClick={() => set({ p0: Object.fromEntries(res.params.map((p) => [p.name, +p.value.toPrecision(6)])) })}
                  >
                    Usa il risultato
                  </button>
                )}
              </div>
            )
          )}
          <p className="fit-panel__hint">Ogni simbolo diverso da x è un parametro. Funzioni: sin cos exp ln sqrt… · costanti pi, e, g</p>
        </div>
      )}

      {cfg.model !== 'none' && (
        <div className="fit-panel__range">
          <label className="advanced__toggle">
            <input
              type="checkbox"
              checked={cfg.range}
              onChange={(e) => {
                if (!e.target.checked) return set({ range: false })
                // all'attivazione l'intervallo copre tutti i dati
                const xs = rows.map((r) => r.x)
                set(xs.length ? { range: true, xmin: Math.min(...xs), xmax: Math.max(...xs) } : { range: true })
              }}
            />
            <span>Intervallo di fit</span>
          </label>
          {cfg.range && (
            <>
              <label className="control-bar__field">
                {activeDisplay.xHeader} da
                <NumField value={cfg.xmin} onChange={(xmin) => set({ xmin })} width={70} />a
                <NumField value={cfg.xmax} onChange={(xmax) => set({ xmax })} width={70} />
              </label>
              <span className="fit-panel__hint">
                {inRange.length} di {rows.length} punti · trascina le linee tratteggiate sul grafico
              </span>
            </>
          )}
        </div>
      )}

      {cfg.model !== 'none' && res && !res.ok && <p className="fit-panel__note fit-panel__note--warn">{res.error}</p>}
      {cfg.model !== 'none' && !res && <p className="fit-panel__note">Aggiungi dei punti per calcolare il fit.</p>}

      {res?.ok && (
        <div className="fit-panel__result">
          <div className="fit-panel__formula">{res.formula}</div>
          <table className="fit-panel__params">
            <tbody>
              {res.params.map((p) => (
                <tr key={p.name}>
                  <th>{p.name}</th>
                  <td>{formatPM(p.value, p.err)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="stats">
            <div>
              <dt>Punti</dt>
              <dd>{res.n}</dd>
            </div>
            <div>
              <dt>Gradi lib.</dt>
              <dd>{res.dof}</dd>
            </div>
            {res.weighted && (
              <>
                <div>
                  <dt>χ²</dt>
                  <dd>{res.chi2.toPrecision(4)}</dd>
                </div>
                <div title="χ² ridotto: vicino a 1 se gli errori sono stimati bene">
                  <dt>χ²/ν</dt>
                  <dd>{Number.isFinite(res.chi2red) ? res.chi2red.toPrecision(3) : '—'}</dd>
                </div>
              </>
            )}
            <div>
              <dt>R²</dt>
              <dd>{Number.isFinite(res.r2) ? res.r2.toFixed(5) : '—'}</dd>
            </div>
          </dl>

          <div className="fit-panel__residuals-head">
            <span className="control-bar__label">Residui</span>
            <div className="segmented segmented--small" role="radiogroup">
              {(
                [
                  ['abs', 'y − f(x)'],
                  ['norm', '(y − f)/σy'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={`segmented__item${resMode === k ? ' segmented__item--active' : ''}`}>
                  <input type="radio" name={`res-${active.id}`} checked={resMode === k} disabled={k === 'norm' && !inRange.some((r) => r.ey > 0)} onChange={() => setResMode(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Residuals rows={inRange} f={res.f} color={active.color} normalized={resMode === 'norm'} />

          <p className="fit-panel__note">
            {res.weighted
              ? `Fit pesato con ${res.xErrors ? 'σy e σx (varianza efficace)' : 'σy'}: gli errori dei parametri vengono dagli errori dei dati.`
              : res.dof > 0
                ? `Fit non pesato${cfg.useErrors && hasErrors ? ' (alcuni punti non hanno errore)' : ''}: gli errori dei parametri sono stimati dalla dispersione dei residui.`
                : 'Tanti punti quanti parametri: la curva passa per tutti i punti, gli errori non sono stimabili.'}
            {res.skipped > 0 && ` ${res.skipped} punti esclusi (x ≤ 0).`}
          </p>
        </div>
      )}
    </div>
  )
}
