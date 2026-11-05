import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type SchemeValue = { solid?: string; varChain?: string }
type ContractToken = {
  token: string
  schemes: Record<'beige' | 'bright' | 'dark', SchemeValue>
}

const CONTRACT_PATH = resolve(import.meta.dirname, 'semantic-palette-contract.json')
const INDEX_CSS = resolve(import.meta.dirname, '../src/index.css')
const APP_CSS_PATH = resolve(import.meta.dirname, '../src/App.css')

function parseHexColor(input: string): string | null {
  const trimmed = input.trim()
  const hex = trimmed.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    const raw = hex[1]!
    if (raw.length === 3) return `#${raw.split('').map((c) => c + c).join('')}`
    return `#${raw.slice(0, 6)}`
  }
  return null
}

function readCssCustomProperty(name: string, scheme: 'beige' | 'bright' | 'dark'): string | null {
  const source = readFileSync(INDEX_CSS, 'utf8')
  const block =
    scheme === 'beige'
      ? source.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
      : source.match(new RegExp(`:root\\[data-color-scheme='${scheme}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`, 'i'))?.[1] ?? ''
  const match = block.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`))
  return match ? parseHexColor(match[1]!.trim()) : null
}

function relativeLuminance(hex: string): number {
  const normalized = parseHexColor(hex)
  if (!normalized) throw new Error(`unsupported color ${hex}`)
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(1 + offset, 3 + offset), 16) / 255)
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

function contractSolid(token: string, scheme: 'beige' | 'bright' | 'dark'): string {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as { tokens: ContractToken[] }
  const row = contract.tokens.find((entry) => entry.token === token)
  const solid = row?.schemes[scheme]?.solid ?? row?.schemes[scheme]?.varChain
  const parsed = solid ? parseHexColor(solid) : null
  if (!parsed) throw new Error(`missing solid for ${token} ${scheme}`)
  return parsed
}

function surfaceColor(token: string, scheme: 'beige' | 'bright' | 'dark'): string {
  const fromCss = readCssCustomProperty(token, scheme)
  if (fromCss) return fromCss
  return contractSolid(token, scheme)
}

describe('inverse ink on saturated control surfaces', () => {
  const schemes = ['beige', 'bright', 'dark'] as const
  const controlSurfaces = [
    '--vg-control-primary',
    '--vg-control-destructive',
    '--vg-control-affirmative',
    '--vg-control-segment-active',
  ] as const

  for (const scheme of schemes) {
    it(`meets WCAG 4.5:1 for ${scheme} inverse on primary/destructive/affirmative/segment fills`, () => {
      const inverse = surfaceColor('--vg-text-inverse', scheme)
      for (const surfaceToken of controlSurfaces) {
        const surface = surfaceColor(surfaceToken, scheme)
        const ratio = contrastRatio(inverse, surface)
        expect(ratio, `${scheme} ${surfaceToken} ${surface} vs ${inverse}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`uses a darker distinct primary hover fill for ${scheme}`, () => {
      const inverse = surfaceColor('--vg-text-inverse', scheme)
      const primary = surfaceColor('--vg-control-primary', scheme)
      const hover = surfaceColor('--vg-control-primary-hover', scheme)
      expect(hover.toLowerCase()).not.toBe(primary.toLowerCase())
      expect(relativeLuminance(hover)).toBeLessThan(relativeLuminance(primary))
      expect(contrastRatio(inverse, hover), `${scheme} hover ${hover} vs ${inverse}`).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('uses darker dark-scheme destructive hover under inverse text', () => {
    const inverse = surfaceColor('--vg-text-inverse', 'dark')
    const hover = surfaceColor('--vg-control-destructive-hover', 'dark')
    expect(contrastRatio(inverse, hover)).toBeGreaterThanOrEqual(4.5)
  })

  for (const scheme of schemes) {
    it(`uses a darker distinct affirmative hover fill for ${scheme}`, () => {
      const inverse = surfaceColor('--vg-text-inverse', scheme)
      const resting = surfaceColor('--vg-control-affirmative', scheme)
      const hover = surfaceColor('--vg-control-affirmative-hover', scheme)
      expect(hover.toLowerCase()).not.toBe(resting.toLowerCase())
      expect(relativeLuminance(hover)).toBeLessThan(relativeLuminance(resting))
      expect(contrastRatio(inverse, hover)).toBeGreaterThanOrEqual(4.5)
    })

    it(`uses a darker distinct segment hover fill for ${scheme}`, () => {
      const inverse = surfaceColor('--vg-text-inverse', scheme)
      const resting = surfaceColor('--vg-control-segment-active', scheme)
      const hover = surfaceColor('--vg-control-segment-active-hover', scheme)
      expect(hover.toLowerCase()).not.toBe(resting.toLowerCase())
      expect(relativeLuminance(hover)).toBeLessThan(relativeLuminance(resting))
      expect(contrastRatio(inverse, hover)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('App.css saturated inverse hover cascade', () => {
  const appCss = readFileSync(APP_CSS_PATH, 'utf8')
  const globalHoverIdx = appCss.indexOf('button:hover:not(:disabled),\n.toolbar-save-mode-group')
  const cloningDialogHoverIdx = appCss.indexOf(
    'gateway-attb-primers-modal\n) button:hover:not(:disabled):not(.is-active):not(.is-selected):not(.is-primary)',
  )
  const saturatedIdx = appCss.indexOf('/* Saturated inverse control hovers')

  function ruleBodyAfter(selectorNeedle: string, fromIndex = saturatedIdx): string {
    const start = appCss.indexOf(selectorNeedle, fromIndex)
    expect(start, `missing selector ${selectorNeedle}`).toBeGreaterThanOrEqual(0)
    const open = appCss.indexOf('{', start)
    const close = appCss.indexOf('}', open)
    return appCss.slice(open + 1, close)
  }

  it('declares saturated hovers after generic button and cloning-dialog hover rules', () => {
    expect(globalHoverIdx).toBeGreaterThanOrEqual(0)
    expect(cloningDialogHoverIdx).toBeGreaterThan(globalHoverIdx)
    expect(saturatedIdx).toBeGreaterThan(cloningDialogHoverIdx)
  })

  const primaryOwners = [
    '.protein-uniprot-search-button:not(.is-cancel):hover:not(:disabled)',
    '.db-picker-actions button.primary:hover:not(:disabled)',
    '.translation-actions button.primary:hover:not(:disabled)',
    '.db-main-actions button.database-construct-add-button:hover:not(:disabled)',
    '.guidescan-design-dialog .sgrna-dialog-actions button.guidescan-add-selected.is-primary:hover:not(:disabled)',
    ":root[data-color-scheme] [role='dialog'] .translation-actions button.primary:hover:not(:disabled)",
  ] as const

  const affirmativeOwners = [
    '.sgrna-dialog-actions button:last-child:not(.is-primary):not(.guidescan-add-selected):hover:not(:disabled)',
    ":root[data-color-scheme] [role='dialog'] .sgrna-dialog-actions button:last-child:not(.is-primary):not(.guidescan-add-selected):hover:not(:disabled)",
  ] as const

  const segmentOwners = [
    '.enzyme-position-mode-toggle button.is-active:hover:not(:disabled)',
    ':root[data-color-scheme] .enzyme-position-mode-toggle button.is-active:hover:not(:disabled)',
  ] as const

  it('keeps inverse primary hovers on saturated tokens', () => {
    const primaryBody = ruleBodyAfter(primaryOwners[0]!)
    expect(primaryBody).toContain('background: var(--vg-control-primary-hover)')
    expect(primaryBody).toContain('color: var(--vg-text-inverse)')
    for (const owner of primaryOwners) {
      expect(appCss.slice(saturatedIdx)).toContain(owner)
    }
  })

  it('keeps inverse affirmative hovers on saturated tokens', () => {
    const body = ruleBodyAfter(affirmativeOwners[0]!)
    expect(body).toContain('background: var(--vg-control-affirmative-hover)')
    expect(body).toContain('color: var(--vg-text-inverse)')
    for (const owner of affirmativeOwners) {
      expect(appCss.slice(saturatedIdx)).toContain(owner)
    }
  })

  it('keeps inverse segment-active hovers on saturated tokens', () => {
    const body = ruleBodyAfter(segmentOwners[0]!)
    expect(body).toContain('background: var(--vg-control-segment-active-hover)')
    expect(body).toContain('color: var(--vg-text-inverse)')
    for (const owner of segmentOwners) {
      expect(appCss.slice(saturatedIdx)).toContain(owner)
    }
  })
})
