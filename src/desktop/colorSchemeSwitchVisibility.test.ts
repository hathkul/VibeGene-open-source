import { describe, expect, it } from 'vitest'
import { HYBRID_WINDOW_SPECS } from './hybridWindows'
import { shouldShowColorSchemeSwitch } from './colorSchemeSwitchVisibility'

describe('color scheme switch window visibility', () => {
  it('shows in main document windows and the standalone Database window', () => {
    expect(shouldShowColorSchemeSwitch(null)).toBe(true)
    expect(shouldShowColorSchemeSwitch('database')).toBe(true)
  })

  it('hides in startup, file creation, and auxiliary windows', () => {
    for (const kind of Object.keys(HYBRID_WINDOW_SPECS) as Array<keyof typeof HYBRID_WINDOW_SPECS>) {
      if (kind === 'database') continue
      expect(shouldShowColorSchemeSwitch(kind)).toBe(false)
    }
  })
})
