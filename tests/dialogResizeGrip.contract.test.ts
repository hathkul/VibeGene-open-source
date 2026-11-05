import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')

describe('dialog resize grip contract', () => {
  it('uses transparent background and diagonal outline lines in all schemes', () => {
    expect(appCss).toMatch(/\.dialog-resize-grip \{[\s\S]*?background-color: transparent;[\s\S]*?background-image: linear-gradient\(/)
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.dialog-resize-grip \{[\s\S]*?background-color: transparent;[\s\S]*?var\(--vg-scientific-outline-ink\)/,
    )
    expect(appCss).not.toMatch(/\.dialog-resize-grip \{[^}]*var\(--vg-surface-panel\)/)
  })

  it('keeps the legacy diagonal grip on the nested database and primer dialogs', () => {
    for (const selector of ['.db-manager-resize-handle', '.primer-editor-resize-handle']) {
      const escaped = selector.replace('.', '\\.')
      expect(appCss).toMatch(
        new RegExp(`${escaped} \\{[\\s\\S]*?background-color: transparent;[\\s\\S]*?background-image: linear-gradient\\(`),
      )
    }
    expect(appCss).not.toMatch(/\.(?:db-manager|primer-editor)-resize-handle \{[^}]*var\(--vg-control-surface\)/)
  })
})
