/** Nome di vettore: lettera con la freccia sopra (es. a⃗). */
export function Vec({ children }: { children: string }) {
  return <span className="vec">{children}</span>
}

/** Espressione con vettori, es. "a + b": le lettere singole diventano vettori. */
export function VecExpr({ expr }: { expr: string }) {
  return (
    <>
      {expr.split(/([a-z])/).map((part, i) => (/^[a-z]$/.test(part) ? <Vec key={i}>{part}</Vec> : <span key={i}>{part}</span>))}
    </>
  )
}
