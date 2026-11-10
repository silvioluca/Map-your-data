/**
 * Piccolo parser di espressioni matematiche (senza eval).
 * Operatori: + − * / ^ (o **), meno unario, parentesi. Moltiplicazione implicita tra numero e nome (2x, 3sin(x)).
 * Funzioni: sin cos tan asin acos atan sinh cosh tanh sqrt exp ln log log10 log2 abs sign floor ceil round
 * Costanti: pi (π), e, g (9.81)
 */

type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'un'; op: '-'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] }

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
}

const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E, g: 9.81 }

export const FUNCTION_NAMES = Object.keys(FUNCS)
export const CONSTANT_NAMES = Object.keys(CONSTS)

export class ExprError extends Error {}

const IDENT = /[\p{L}_][\p{L}\p{N}_]*/uy
const NUMBER = /(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/iy

function parse(src: string): Node {
  const s = src.replace(/\*\*/g, '^').replace(/[·×]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,(?=\d)/g, '.')
  let i = 0
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  const peek = () => {
    ws()
    return s[i]
  }
  const expect = (c: string) => {
    if (peek() !== c) throw new ExprError(`manca “${c}”`)
    i++
  }

  const primary = (): Node => {
    const c = peek()
    if (c === undefined) throw new ExprError('espressione incompleta')
    if (c === '(') {
      i++
      const n = expr()
      expect(')')
      return n
    }
    NUMBER.lastIndex = i
    const m = NUMBER.exec(s)
    if (m) {
      i += m[0].length
      return { t: 'num', v: parseFloat(m[0]) }
    }
    IDENT.lastIndex = i
    const id = IDENT.exec(s)
    if (id) {
      i += id[0].length
      const name = id[0]
      if (peek() === '(') {
        if (!FUNCS[name]) throw new ExprError(`funzione sconosciuta: ${name}`)
        i++
        const args: Node[] = []
        if (peek() !== ')') {
          args.push(expr())
          while (peek() === ';' || peek() === ',') {
            i++
            args.push(expr())
          }
        }
        expect(')')
        return { t: 'call', fn: name, args }
      }
      return { t: 'var', name }
    }
    throw new ExprError(`carattere inatteso: “${c}”`)
  }

  // potenza: associativa a destra, lega più del meno unario (-x^2 = -(x^2))
  const power = (): Node => {
    const base = primary()
    if (peek() === '^') {
      i++
      return { t: 'bin', op: '^', a: base, b: unary() }
    }
    return base
  }
  const unary = (): Node => {
    const c = peek()
    if (c === '-') {
      i++
      return { t: 'un', op: '-', a: unary() }
    }
    if (c === '+') {
      i++
      return unary()
    }
    return power()
  }
  const term = (): Node => {
    let n = unary()
    for (;;) {
      const c = peek()
      if (c === '*' || c === '/') {
        i++
        n = { t: 'bin', op: c, a: n, b: unary() }
      } else if (c !== undefined && (c === '(' || /[\p{L}_\d.]/u.test(c))) {
        // moltiplicazione implicita: 2x, 2(x+1), (a)(b)
        n = { t: 'bin', op: '*', a: n, b: unary() }
      } else return n
    }
  }
  const expr = (): Node => {
    let n = term()
    for (;;) {
      const c = peek()
      if (c === '+' || c === '-') {
        i++
        n = { t: 'bin', op: c, a: n, b: term() }
      } else return n
    }
  }

  const root = expr()
  if (peek() !== undefined) throw new ExprError(`carattere inatteso: “${peek()}”`)
  return root
}

function collect(n: Node, out: Set<string>) {
  if (n.t === 'var') out.add(n.name)
  else if (n.t === 'un') collect(n.a, out)
  else if (n.t === 'bin') {
    collect(n.a, out)
    collect(n.b, out)
  } else if (n.t === 'call') n.args.forEach((a) => collect(a, out))
}

export interface Compiled {
  /** variabili libere (costanti escluse) */
  vars: string[]
  /** valuta con i valori nello stesso ordine di `order` */
  evalWith: (order: string[]) => (vals: number[]) => number
}

export function compile(src: string): Compiled {
  if (!src.trim()) throw new ExprError('formula vuota')
  const root = parse(src)
  const names = new Set<string>()
  collect(root, names)
  const vars = [...names].filter((v) => !(v in CONSTS))
  return {
    vars,
    evalWith: (order) => {
      const idx = new Map(order.map((n, k) => [n, k]))
      for (const v of vars) if (!idx.has(v)) throw new ExprError(`simbolo sconosciuto: ${v}`)
      const build = (n: Node): ((v: number[]) => number) => {
        switch (n.t) {
          case 'num': {
            const c = n.v
            return () => c
          }
          case 'var': {
            if (n.name in CONSTS && !idx.has(n.name)) {
              const c = CONSTS[n.name]
              return () => c
            }
            const k = idx.get(n.name)!
            return (v) => v[k]
          }
          case 'un': {
            const a = build(n.a)
            return (v) => -a(v)
          }
          case 'bin': {
            const a = build(n.a)
            const b = build(n.b)
            switch (n.op) {
              case '+':
                return (v) => a(v) + b(v)
              case '-':
                return (v) => a(v) - b(v)
              case '*':
                return (v) => a(v) * b(v)
              case '/':
                return (v) => a(v) / b(v)
              case '^':
                return (v) => Math.pow(a(v), b(v))
            }
            break
          }
          case 'call': {
            const f = FUNCS[n.fn]
            const args = n.args.map(build)
            if (args.length === 1) {
              const a0 = args[0]
              return (v) => f(a0(v))
            }
            return (v) => f(...args.map((a) => a(v)))
          }
        }
        throw new ExprError('nodo non valido')
      }
      return build(root)
    },
  }
}

/** Simbolo di una colonna dalla sua intestazione: "t (s)" → "t", "σs (m)" → "σs". */
export function symbolOf(header: string, fallback: string): string {
  const m = header.trim().match(/^[\p{L}_][\p{L}\p{N}_]*/u)
  const s = m?.[0]
  if (!s || s in FUNCS || s in CONSTS) return fallback
  return s
}
