import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanProject, scientificRegistryKey, type ThemeFinding } from './check-theme-colors.ts'
import { checkThemeDebt } from './check-theme-debt.ts'
import { isGenericBiologicalReason } from './theme-closure-classification.ts'

const REGISTRY_PATH = resolve(import.meta.dirname, 'theme-scientific-color-registry.json')
const INDEX_CSS = resolve(import.meta.dirname, '../src/index.css')

const FORBIDDEN_CLASSIFICATIONS = new Set(['needs-review', 'specialized-state', 'dead-or-shadowed'])

const CHROME_OWNER_PATTERN =
  /(\.dialog-footer|\.dialog-actions|panel-chrome|\.chip\b|vg-gallery-scheme-dot|tools-gel-canvas|\.form-input|text-input|pagination|toolbar-edit-item|database-construct-add-button|menu-item(?![^\n]*hop-label))/i

function registryKey(f: Pick<ThemeFinding, 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return scientificRegistryKey(f)
}

describe('live scoped scientific colors', () => {
  it('keeps manifest, registry, and raw scan aligned with zero enforced debt', async () => {
    const result = await checkThemeDebt()
    expect(result.rawCount).toBe(result.registryCount)
    expect(result.classificationCounts['scientific-data']).toBe(result.rawCount)
    for (const forbidden of FORBIDDEN_CLASSIFICATIONS) {
      expect(result.classificationCounts[forbidden] ?? 0).toBe(0)
    }
    const enforced = await scanProject({ mode: 'enforced' })
    expect(enforced).toEqual([])
  }, 30_000)

  it('requires every registry row to match a live raw finding', async () => {
    const raw = await scanProject({ mode: 'raw' })
    const rawById = new Map(raw.map((finding) => [finding.id, finding]))
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as {
      findings: Array<{
        id: string
        file: string
        kind: ThemeFinding['kind']
        property: string
        literal: string
        owner: string
        locator: ThemeFinding['locator']
        biologicalReason: string
      }>
    }

    const seenIds = new Set<string>()
    for (const row of registry.findings) {
      expect(row.file.includes('*') || row.owner.includes('*')).toBe(false)
      expect(isGenericBiologicalReason(row.biologicalReason), `generic reason for ${row.id}`).toBe(false)
      expect(row.biologicalReason.includes(row.file)).toBe(true)
      expect(row.biologicalReason.includes(row.locator.owner)).toBe(true)
      expect(CHROME_OWNER_PATTERN.test(row.owner), `chrome owner registered as scientific ${row.id}: ${row.owner}`).toBe(false)

      expect(seenIds.has(row.id), `duplicate registry id ${row.id}`).toBe(false)
      seenIds.add(row.id)

      const live = rawById.get(row.id)
      expect(live, `stale registry row ${row.id}`).toBeTruthy()
      expect(live!.file).toBe(row.file)
      expect(live!.kind).toBe(row.kind)
      expect(live!.property).toBe(row.property)
      expect(live!.literal).toBe(row.literal)
      expect(live!.locator.owner).toBe(row.locator.owner)
      expect(live!.locator.anchor).toBe(row.locator.anchor)
    }

    const indexCssRaw = raw.filter((finding) => finding.file === 'src/index.css')
    const rawOutsideIndex = raw.filter((finding) => finding.file !== 'src/index.css')
    const rawOutsideKeys = new Set(rawOutsideIndex.map((finding) => registryKey(finding)))
    const registryOutsideIndex = registry.findings.filter((row) => row.file !== 'src/index.css')
    expect(registryOutsideIndex.length).toBe(rawOutsideIndex.length)
    for (const row of registryOutsideIndex) {
      expect(rawOutsideKeys.has(registryKey({
        file: row.file,
        kind: row.kind as ThemeFinding['kind'],
        property: row.property,
        literal: row.literal,
        locator: row.locator,
      }))).toBe(true)
    }

    const css = readFileSync(INDEX_CSS, 'utf8')
    for (const finding of indexCssRaw) {
      expect(css.includes(finding.literal), `index.css literal ${finding.literal} missing from theme layer`).toBe(true)
    }

    const registryKeys = new Set(registry.findings.map((row) => registryKey({
      file: row.file,
      kind: row.kind as ThemeFinding['kind'],
      property: row.property,
      literal: row.literal,
      locator: row.locator,
    })))
    const unregisteredOutsideIndex = rawOutsideIndex.filter((finding) => !registryKeys.has(registryKey(finding)))
    expect(unregisteredOutsideIndex).toEqual([])
  }, 30_000)
})
