import type { DataPoint, FieldInfo, Mode } from '../types'

type Raw = Omit<DataPoint, 'id'>

/** Legge CSV/TSV (anche incollato da un foglio di calcolo). Colonne: x, y, valore  oppure  x, y, vx, vy. */
export function parseTable(text: string, kind: FieldInfo['kind']): { points: Raw[]; skipped: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { points: [], skipped: 0 }
  const first = lines[0]
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ','
  // con ";" o tab la virgola è il separatore decimale
  const toNum = (s: string) => {
    const t = s.trim().replace(/^"|"$/g, '')
    const v = parseFloat(sep === ',' ? t : t.replace(',', '.'))
    return Number.isFinite(v) ? v : null
  }
  const points: Raw[] = []
  let skipped = 0
  for (const line of lines) {
    const cells = line.split(sep).map(toNum)
    const need = kind === 'scalar' ? 3 : 4
    if (cells.length < need || cells.slice(0, need).some((c) => c === null)) {
      skipped++
      continue
    }
    const [x, y, a, b] = cells as number[]
    points.push(kind === 'scalar' ? { x, y, s: a, u: 1, v: 0 } : { x, y, s: Math.hypot(a, b), u: a, v: b })
  }
  // la riga di intestazione non conta come scartata
  if (skipped > 0 && toNum(first.split(sep)[0]) === null) skipped--
  return { points, skipped }
}

export function toCsv(points: DataPoint[], field: FieldInfo, mode: Mode): string {
  const xl = mode === 'map' ? 'lon' : 'x'
  const yl = mode === 'map' ? 'lat' : 'y'
  const n = field.name || (field.kind === 'scalar' ? 'f' : 'v')
  const head = field.kind === 'scalar' ? [xl, yl, n] : [xl, yl, `${n}x`, `${n}y`]
  const rows = points.map((p) => (field.kind === 'scalar' ? [p.x, p.y, p.s] : [p.x, p.y, p.u, p.v]).join(','))
  return [head.join(','), ...rows].join('\n')
}

export function download(name: string, content: string | Blob, type = 'text/csv') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
