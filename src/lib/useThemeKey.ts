import { useEffect, useState } from 'react'

/** Tema corrente (attributo data-theme), per ridisegnare i canvas quando cambia. */
export function useThemeKey(): string {
  const [key, setKey] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'light')
  useEffect(() => {
    const obs = new MutationObserver(() => setKey(document.documentElement.getAttribute('data-theme') ?? 'light'))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return key
}
