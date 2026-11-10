import { useEffect, useRef, useState } from 'react'

/** Cella numerica modificabile: conferma con Invio o uscendo dal campo. */
export function NumCell({ value, onCommit, className }: { value: number; onCommit: (v: number) => void; className?: string }) {
  const [text, setText] = useState(String(+value.toPrecision(7)))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(+value.toPrecision(7)))
  }, [value])
  const commit = () => {
    const v = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(v)) onCommit(v)
    else setText(String(+value.toPrecision(7)))
  }
  return (
    <input
      className={`data-table__input${className ? ' ' + className : ''}`}
      value={text}
      inputMode="decimal"
      onFocus={(e) => {
        focused.current = true
        e.target.select()
      }}
      onBlur={() => {
        focused.current = false
        commit()
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setText(String(+value.toPrecision(7)))
          focused.current = false
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
