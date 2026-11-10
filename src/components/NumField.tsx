import { useEffect, useRef, useState } from 'react'

const show = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(8)) : '')

/** Campo numerico che non "salta" mentre si scrive (accetta anche la virgola decimale). */
export function NumField({ value, onChange, disabled, width }: { value: number; onChange: (v: number) => void; disabled?: boolean; width?: number }) {
  const [text, setText] = useState(show(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(show(value))
  }, [value])
  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={text}
      style={width ? { width } : undefined}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false
        setText(show(value))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseFloat(e.target.value.replace(',', '.'))
        if (Number.isFinite(v)) onChange(v)
      }}
    />
  )
}
