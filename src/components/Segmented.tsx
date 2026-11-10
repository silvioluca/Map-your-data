interface Props<T extends string> {
  name: string
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
}

/** Interruttore a più posizioni, come in Trakker. */
export function Segmented<T extends string>({ name, value, options, onChange }: Props<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={`segmented__item${o.value === value ? ' segmented__item--active' : ''}`} title={o.title}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}
