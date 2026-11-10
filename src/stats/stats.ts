/** Statistica descrittiva di misure ripetute. */

export interface Summary {
  n: number
  mean: number
  /** deviazione standard campionaria (n − 1) */
  sd: number
  /** errore standard della media σ/√n */
  sem: number
  median: number
  min: number
  max: number
  /** semidispersione massima (max − min)/2 */
  halfRange: number
}

export function summarize(values: number[]): Summary | null {
  const v = values.filter(Number.isFinite)
  const n = v.length
  if (n === 0) return null
  const mean = v.reduce((a, b) => a + b, 0) / n
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN
  const s = [...v].sort((a, b) => a - b)
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  return { n, mean, sd, sem: sd / Math.sqrt(n), median, min: s[0], max: s[n - 1], halfRange: (s[n - 1] - s[0]) / 2 }
}

export interface Histogram {
  edges: number[]
  counts: number[]
  width: number
}

/** Classi automatiche con la regola di Sturges (k = 1 + log₂ n). */
export function autoBins(n: number): number {
  return Math.max(3, Math.min(30, Math.ceil(1 + Math.log2(Math.max(1, n)))))
}

export function histogram(values: number[], k: number): Histogram | null {
  const v = values.filter(Number.isFinite)
  if (v.length === 0) return null
  let lo = Math.min(...v)
  let hi = Math.max(...v)
  if (hi === lo) {
    const d = Math.abs(lo) * 0.05 || 0.5
    lo -= d
    hi += d
    k = 1
  }
  const width = (hi - lo) / k
  const edges = Array.from({ length: k + 1 }, (_, i) => lo + i * width)
  const counts = new Array(k).fill(0)
  for (const x of v) {
    // il massimo cade nell'ultima classe
    const i = Math.min(k - 1, Math.floor((x - lo) / width))
    counts[i]++
  }
  return { edges, counts, width }
}

/** Classi di larghezza fissa a partire da `start` (che si sposta indietro se serve a includere il minimo). */
export function histogramByWidth(values: number[], width: number, start: number): Histogram | null {
  const v = values.filter(Number.isFinite)
  if (v.length === 0 || !(width > 0)) return null
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  let s0 = Number.isFinite(start) ? start : Math.floor(lo / width) * width
  if (s0 > lo) s0 -= Math.ceil((s0 - lo) / width) * width
  let k = Math.max(1, Math.ceil((hi - s0) / width + 1e-9))
  if (s0 + k * width <= hi) k++
  if (k > 200) return null
  const edges = Array.from({ length: k + 1 }, (_, i) => +(s0 + i * width).toPrecision(12))
  const counts = new Array(k).fill(0)
  for (const x of v) counts[Math.min(k - 1, Math.floor((x - s0) / width + 1e-9))]++
  return { edges, counts, width }
}

/** Dati interi in un intervallo piccolo: una classe per ogni intero (utile per i conteggi). */
export function integerData(values: number[]): boolean {
  if (values.length === 0 || !values.every((v) => Number.isInteger(v))) return false
  return Math.max(...values) - Math.min(...values) <= 60
}

export const gaussPdf = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI))
