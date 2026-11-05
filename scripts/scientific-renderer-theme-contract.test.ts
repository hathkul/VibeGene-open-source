import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const indexCss = read('src/index.css')
const appCss = read('src/App.css')
const traceViewer = read('src/TraceViewer.tsx')
const alignmentPane = read('src/components/SequenceAlignmentPane.tsx')
const cloningSources = [
  'src/CloningSchemaPanel.tsx',
  'src/GatewayCloningDialog.tsx',
  'src/GibsonAssemblyDialog.tsx',
  'src/TaGcCloningDialog.tsx',
].map(read).join('\n')

describe('scientific renderer theme contract', () => {
  it('defines renderer contrast roles independently from ordinary chrome', () => {
    for (const token of [
      '--vg-scientific-ruler-ink',
      '--vg-scientific-outline-ink',
      '--vg-scientific-leader-ink',
      '--vg-scientific-label-ink',
      '--vg-scientific-label-halo',
      '--vg-scientific-selection-ink',
      '--vg-scientific-cut-ink',
      '--vg-scientific-selection-overlay',
      '--vg-residue-glyph-ink',
      '--vg-residue-selection-surface',
      '--vg-cloning-diagram-ink',
      '--vg-trace-g-line',
      '--vg-trace-g-fill',
    ]) {
      expect(indexCss).toContain(`${token}:`)
    }

    expect(indexCss).toMatch(/:root\[data-color-scheme='dark'\][\s\S]*--vg-scientific-ruler-ink:/)
    expect(indexCss).toMatch(/:root\[data-color-scheme='dark'\][\s\S]*--vg-trace-g-line:/)
  })

  it('keeps all three scheme preview dots fixed and distinct', () => {
    expect(appCss).toContain('background: var(--vg-scheme-preview-beige);')
    expect(appCss).toContain('background: var(--vg-scheme-preview-bright);')
    expect(appCss).toContain('background: var(--vg-scheme-preview-dark);')
  })

  it('routes map and sequence geometry through scientific roles', () => {
    expect(appCss).toMatch(/\.map-backbone \{[\s\S]*?stroke: var\(--vg-scientific-ruler-ink\);/)
    expect(appCss).toMatch(/\.map-feature-shape \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);/)
    expect(appCss).toMatch(/\.map-selection \{[\s\S]*?stroke: var\(--vg-scientific-selection-overlay\);/)
    expect(appCss).toMatch(/\.sequence-feature-body-frame path \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);/)
    expect(appCss).toMatch(/\.sequence-ruler-line,[\s\S]*?stroke: var\(--vg-scientific-ruler-ink\);/)
    expect(appCss).toMatch(/\.sequence-translation-residue \{[\s\S]*?color: var\(--vg-residue-glyph-ink\);/)
    expect(appCss).toMatch(/\.sequence-translation-residue\.selected \{[\s\S]*?background: var\(--vg-residue-selection-surface\);/)
    expect(appCss).toMatch(/\.protein-residue \{[\s\S]*?color: var\(--vg-residue-glyph-ink\);/)
    expect(appCss).toMatch(/\.protein-residue\.is-selected \{[\s\S]*?background: var\(--vg-residue-selection-surface\);/)
  })

  it('draws only a thin scientific outline on the protein residue strip', () => {
    expect(appCss).toMatch(/\.protein-map-backbone \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);[\s\S]*?stroke-width: 1;/)
    expect(appCss).toMatch(/:root\[data-color-scheme='dark'\] \.protein-map-backbone \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);/)
    expect(appCss).not.toMatch(/\.protein-map-backbone \{[^}]*stroke: var\(--vg-border\)/)
    expect(appCss).toMatch(/\.map-backbone \{[^}]*stroke-width: 3\.2;/)
  })

  it('uses dedicated G-trace and cloning-diagram roles', () => {
    expect(traceViewer).toContain("var(--vg-trace-g-line)")
    expect(traceViewer).toContain("var(--vg-trace-g-fill)")
    expect(alignmentPane).toContain("var(--vg-trace-g-line)")
    expect(alignmentPane).toContain("var(--vg-trace-g-fill)")
    expect(cloningSources).toContain('var(--vg-cloning-diagram-ink)')
    expect(cloningSources).not.toContain('var(--vg-diagram-line)')
  })
})
