import type { Quantity } from './lib/fieldlines'

export type Mode = 'plane' | 'image' | 'map'
export type FieldKind = 'scalar' | 'vector'
export type ViewKind = 'color' | 'vectors' | 'lines' | 'contour' | 'surface'
export type Interp = 'tps' | 'idw' | 'nearest'
export type ColormapName = 'viridis' | 'plasma' | 'inferno' | 'turbo' | 'coolwarm' | 'gray'

/** Un punto misurato. In modalità mappa x = longitudine, y = latitudine. */
export interface DataPoint {
  id: number
  x: number
  y: number
  /** valore scalare */
  s: number
  /** componenti del vettore */
  u: number
  v: number
}

export interface Axes {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  xlabel: string
  ylabel: string
  /** stessa scala su x e y */
  equal: boolean
}

/** Posizione dell'immagine nelle coordinate degli assi (angolo in basso a sinistra + dimensioni). */
export interface ImagePlacement {
  x: number
  y: number
  w: number
  h: number
  lockAspect: boolean
  opacity: number
}

export interface FieldInfo {
  kind: FieldKind
  name: string
  unit: string
}

export interface ViewOptions {
  view: ViewKind
  /** grandezza mostrata da colori, isolinee e 3D */
  quantity: Quantity
  colormap: ColormapName
  interp: Interp
  idwPower: number
  resolution: number
  levels: number
  opacity: number
  showPoints: boolean
  clipHull: boolean
  fillContours: boolean
  autoRange: boolean
  vmin: number
  vmax: number
}

export interface MapView {
  lat: number
  lng: number
  zoom: number
}

/** Campo interpolato su griglia regolare (riga j = y, colonna i = x). */
export interface Grid {
  nx: number
  ny: number
  x0: number
  x1: number
  y0: number
  y1: number
  /** valori scalari (o modulo del vettore); NaN = fuori dominio */
  z: Float64Array
  /** componenti (solo campo vettoriale, o gradiente per lo scalare) */
  gx: Float64Array
  gy: Float64Array
  zmin: number
  zmax: number
  /** fattore di scala di x (cos(lat) sulla mappa) */
  kx: number
}
