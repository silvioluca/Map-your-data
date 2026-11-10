/**
 * Distribuzioni da confrontare con l'istogramma. I parametri si stimano dai dati
 * (media e deviazione standard), poi si calcolano i conteggi attesi per classe
 * e il test del χ² di compatibilità.
 */
import type { Histogram, Summary } from './stats'

export type DistName = 'gauss' | 'poisson' | 'uniform' | 'exp' | 'lognormal'

export const DIST_INFO: Record<DistName, { label: string; color: string; hint: string; discrete: boolean }> = {
  gauss: { label: 'Gaussiana', color: '#1f1f1f', hint: 'errori casuali, somma di tanti effetti', discrete: false },
  poisson: { label: 'Poissoniana', color: '#0a8ea0', hint: 'conteggi di eventi rari (interi ≥ 0)', discrete: true },
  uniform: { label: 'Uniforme', color: '#1a7f37', hint: 'valori equiprobabili in un intervallo', discrete: false },
  exp: { label: 'Esponenziale', color: '#bf8700', hint: 'tempi di attesa, decadimenti (x ≥ 0)', discrete: false },
  lognormal: { label: 'Log-normale', color: '#8250df', hint: 'grandezze positive con coda a destra', discrete: false },
}

export const DIST_ORDER: DistName[] = ['gauss', 'poisson', 'uniform', 'exp', 'lognormal']

/** Funzione d'errore (Abramowitz–Stegun 7.1.26, errore < 1.5·10⁻⁷). */
export function erf(x: number): number {
  const s = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}

function logGamma(z: number): number {
  // Lanczos
  const g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

/** Q(a, x) = Γ(a, x)/Γ(a): funzione gamma incompleta regolarizzata superiore. */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1
  if (x < a + 1) {
    // serie per P
    let sum = 1 / a
    let term = sum
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n)
      sum += term
      if (term < sum * 1e-14) break
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
  }
  // frazione continua per Q (Lentz)
  let b = x + 1 - a
  let c = 1e300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
}

/** Probabilità di ottenere un χ² maggiore di quello osservato, con ν gradi di libertà. */
export function chi2pValue(chi2: number, dof: number): number {
  if (dof <= 0 || !Number.isFinite(chi2)) return NaN
  return gammaQ(dof / 2, chi2 / 2)
}

export interface FittedDist {
  name: DistName
  params: { name: string; value: number }[]
  /** densità (continue) o probabilità di k (discrete) */
  density: (x: number) => number
  cdf: (x: number) => number
  /** motivo per cui la distribuzione non è adatta ai dati (null se va bene) */
  warning: string | null
}

const poissonPmf = (k: number, lam: number) => (k < 0 || !Number.isInteger(k) ? 0 : Math.exp(k * Math.log(lam) - lam - logGamma(k + 1)))

export function fitDist(name: DistName, values: number[], s: Summary): FittedDist | null {
  const { mean, sd } = s
  switch (name) {
    case 'gauss':
      if (!(sd > 0)) return null
      return {
        name,
        params: [
          { name: 'μ', value: mean },
          { name: 'σ', value: sd },
        ],
        density: (x) => Math.exp(-((x - mean) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI)),
        cdf: (x) => 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2))),
        warning: null,
      }
    case 'poisson': {
      if (!(mean > 0)) return null
      const ints = values.every((v) => Number.isInteger(v) && v >= 0)
      const lam = mean
      return {
        name,
        params: [
          { name: 'λ', value: lam },
          { name: '√λ', value: Math.sqrt(lam) },
        ],
        density: (k) => poissonPmf(k, lam),
        cdf: (x) => {
          if (x < 0) return 0
          let sum = 0
          const kmax = Math.floor(x)
          for (let k = 0; k <= kmax; k++) sum += poissonPmf(k, lam)
          return Math.min(1, sum)
        },
        warning: ints ? null : 'la poissoniana descrive conteggi: i dati dovrebbero essere interi ≥ 0',
      }
    }
    case 'uniform': {
      if (!(sd > 0)) return null
      // stessi media e varianza: semiampiezza √3·σ
      const a = mean - Math.sqrt(3) * sd
      const b = mean + Math.sqrt(3) * sd
      return {
        name,
        params: [
          { name: 'a', value: a },
          { name: 'b', value: b },
        ],
        density: (x) => (x >= a && x <= b ? 1 / (b - a) : 0),
        cdf: (x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)),
        warning: null,
      }
    }
    case 'exp': {
      if (!(mean > 0)) return null
      const lam = 1 / mean
      return {
        name,
        params: [
          { name: 'λ', value: lam },
          { name: 'τ = 1/λ', value: mean },
        ],
        density: (x) => (x < 0 ? 0 : lam * Math.exp(-lam * x)),
        cdf: (x) => (x <= 0 ? 0 : 1 - Math.exp(-lam * x)),
        warning: values.some((v) => v < 0) ? 'l’esponenziale vale per x ≥ 0' : null,
      }
    }
    case 'lognormal': {
      if (values.some((v) => v <= 0)) return { name, params: [], density: () => 0, cdf: () => 0, warning: 'la log-normale vale solo per x > 0' }
      const logs = values.map(Math.log)
      const m = logs.reduce((p, q) => p + q, 0) / logs.length
      const sl = Math.sqrt(logs.reduce((p, q) => p + (q - m) ** 2, 0) / Math.max(1, logs.length - 1))
      if (!(sl > 0)) return null
      return {
        name,
        params: [
          { name: 'μ (ln x)', value: m },
          { name: 'σ (ln x)', value: sl },
        ],
        density: (x) => (x <= 0 ? 0 : Math.exp(-((Math.log(x) - m) ** 2) / (2 * sl * sl)) / (x * sl * Math.sqrt(2 * Math.PI))),
        cdf: (x) => (x <= 0 ? 0 : 0.5 * (1 + erf((Math.log(x) - m) / (sl * Math.SQRT2)))),
        warning: null,
      }
    }
  }
}

/** Numero di parametri stimati dai dati (per i gradi di libertà del χ²). */
const N_PARAMS: Record<DistName, number> = { gauss: 2, poisson: 1, uniform: 2, exp: 1, lognormal: 2 }

export interface Chi2Test {
  expected: number[]
  chi2: number
  dof: number
  p: number
  /** qualche classe ha meno di 5 conteggi attesi: test poco affidabile */
  lowCounts: boolean
}

/** Conteggi attesi per classe (le classi estreme comprendono le code) e test del χ². */
export function chi2Test(d: FittedDist, h: Histogram, n: number): Chi2Test {
  const k = h.counts.length
  // per le discrete le classi sono [a, b): si usa la cdf appena sotto il bordo
  const disc = DIST_INFO[d.name].discrete
  const F = (x: number) => (disc ? d.cdf(Math.ceil(x) - 1) : d.cdf(x))
  const expected = h.counts.map((_, i) => {
    const lo = i === 0 ? 0 : F(h.edges[i])
    const hi = i === k - 1 ? 1 : F(h.edges[i + 1])
    return n * Math.max(0, hi - lo)
  })
  let chi2 = 0
  let used = 0
  for (let i = 0; i < k; i++) {
    if (expected[i] <= 0) continue
    chi2 += (h.counts[i] - expected[i]) ** 2 / expected[i]
    used++
  }
  const dof = used - 1 - N_PARAMS[d.name]
  return { expected, chi2, dof, p: chi2pValue(chi2, dof), lowCounts: expected.some((e) => e > 0 && e < 5) }
}
