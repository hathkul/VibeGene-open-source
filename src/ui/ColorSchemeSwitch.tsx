import { useSyncExternalStore, type KeyboardEvent } from 'react'
import {
  COLOR_SCHEMES,
  getColorScheme,
  setColorScheme,
  subscribeColorScheme,
  type ColorScheme,
} from '../domain/colorScheme'

const labels: Record<ColorScheme, string> = {
  beige: 'Beige',
  bright: 'Bright',
  dark: 'Dark',
}

export function ColorSchemeSwitch() {
  const scheme = useSyncExternalStore(subscribeColorScheme, getColorScheme, () => 'beige' as ColorScheme)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = COLOR_SCHEMES.indexOf(scheme)
    const offset = event.key === 'ArrowRight' ? 1 : -1
    const next = COLOR_SCHEMES[(index + offset + COLOR_SCHEMES.length) % COLOR_SCHEMES.length] ?? 'beige'
    setColorScheme(next)
    document.getElementById(`vg-color-scheme-${next}`)?.focus()
  }

  return (
    <div className="vg-color-scheme-control">
      <div className="vg-color-scheme-switch" role="radiogroup" aria-label="Color scheme" onKeyDown={handleKeyDown}>
        {COLOR_SCHEMES.map((option) => (
          <button
            key={option}
            id={`vg-color-scheme-${option}`}
            className="vg-color-scheme-option"
            type="button"
            role="radio"
            aria-checked={scheme === option}
            aria-label={labels[option]}
            title={labels[option]}
            tabIndex={scheme === option ? 0 : -1}
            onClick={() => setColorScheme(option)}
          >
            <span className="vg-color-scheme-swatch" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
