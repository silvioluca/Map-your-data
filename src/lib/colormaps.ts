import type { ColormapName } from '../types'

type RGB = [number, number, number]

const STOPS: Record<ColormapName, string[]> = {
  viridis: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
  turbo: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'],
  coolwarm: ['#3b4cc0', '#5977e3', '#7b9ff9', '#9ebeff', '#c0d4f5', '#dddcdc', '#f2cbb7', '#f7ac8e', '#ee8468', '#d65244', '#b40426'],
  gray: ['#000000', '#ffffff'],
}

export const COLORMAP_LABELS: Record<ColormapName, string> = {
  viridis: 'Viridis',
  plasma: 'Plasma',
  inferno: 'Inferno',
  turbo: 'Turbo',
  coolwarm: 'Caldo/freddo',
  gray: 'Grigi',
}

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const LUT_SIZE = 256
const luts = new Map<ColormapName, Uint8ClampedArray>()

/** Tabella di 256 colori RGB per la colormap. */
export function lut(name: ColormapName): Uint8ClampedArray {
  let l = luts.get(name)
  if (l) return l
  const stops = STOPS[name].map(hex)
  l = new Uint8ClampedArray(LUT_SIZE * 3)
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = (i / (LUT_SIZE - 1)) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(t))
    const f = t - k
    for (let c = 0; c < 3; c++) l[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f
  }
  luts.set(name, l)
  return l
}

/** Colore per t ∈ [0,1]. */
export function colorAt(name: ColormapName, t: number): RGB {
  const l = lut(name)
  const i = Math.max(0, Math.min(LUT_SIZE - 1, Math.round((Number.isFinite(t) ? t : 0) * (LUT_SIZE - 1))))
  return [l[i * 3], l[i * 3 + 1], l[i * 3 + 2]]
}

export function cssColor(name: ColormapName, t: number, alpha = 1): string {
  const [r, g, b] = colorAt(name, t)
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

export function gradientCss(name: ColormapName, direction = 'to top'): string {
  const parts: string[] = []
  for (let i = 0; i <= 10; i++) parts.push(cssColor(name, i / 10))
  return `linear-gradient(${direction}, ${parts.join(', ')})`
}
