import { cssColor, gradientCss } from '../lib/colormaps'
import { tickFmt, ticks, valueRange } from '../lib/render2d'
import { niceLevels } from '../lib/contours'
import { useStore } from '../state/store'
import { quantityLabel } from '../lib/fieldlines'

/** Barra dei colori verticale con le tacche dei valori. */
export function ColorBar() {
  const { state, grid } = useStore()
  if (!grid) return null
  const { opts, field } = state
  const [vmin, vmax] = valueRange(grid, opts)
  const span = vmax - vmin || 1
  const banded = opts.view === 'contour' && opts.fillContours
  let background = gradientCss(opts.colormap)
  if (banded) {
    // colori a bande, come il contour riempito
    const levels = niceLevels(vmin, vmax, opts.levels)
    const stops = [vmin, ...levels, vmax]
    const n = levels.length + 1
    const parts: string[] = []
    for (let b = 0; b < n; b++) {
      const c = cssColor(opts.colormap, b / levels.length)
      const a = ((stops[b] - vmin) / span) * 100
      const z = ((stops[b + 1] - vmin) / span) * 100
      parts.push(`${c} ${a}%`, `${c} ${z}%`)
    }
    background = `linear-gradient(to top, ${parts.join(', ')})`
  }
  const lv = niceLevels(vmin, vmax, opts.levels)
  const tk = opts.view === 'contour' && lv.length <= 12 ? lv : ticks(vmin, vmax, 6)
  const step = tk.length > 1 ? Math.abs(tk[1] - tk[0]) : span
  const label = quantityLabel(field.kind, field.name, opts.quantity)

  return (
    <div className="colorbar">
      <div className="colorbar__title">
        {label}
        {field.unit && opts.quantity === 'value' && <small> {field.unit}</small>}
      </div>
      <div className="colorbar__body">
        <div className="colorbar__strip" style={{ background }} />
        <div className="colorbar__ticks">
          {tk.map((t) => (
            <span key={t} style={{ bottom: `${((t - vmin) / span) * 100}%` }}>
              {tickFmt(t, step)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
