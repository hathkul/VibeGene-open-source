import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('cleavage arrow theme contract', () => {
  it('uses map surface for the halo and theme-aware scientific ink for the arrow', () => {
    expect(appCss).toMatch(
      /\.cleavage-arrow-halo\s*\{[^}]*fill:\s*var\(--map-surface,\s*var\(--vg-diagram-surface\)\);[^}]*stroke:\s*var\(--map-surface,\s*var\(--vg-diagram-surface\)\);/s,
    )
    expect(appCss).toMatch(/\.cleavage-arrow\s*\{[^}]*fill:\s*var\(--vg-scientific-outline-ink\);/s)
    expect(appCss).not.toMatch(/\.cleavage-arrow\s*\{[^}]*#111111/s)
  })
})
