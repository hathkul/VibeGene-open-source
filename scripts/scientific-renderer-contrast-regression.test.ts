import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const indexCss = read('src/index.css')
const appCss = read('src/App.css')
const plasmidMap = read('src/presentation/map/PlasmidMap.tsx')
const sequenceRows = read('src/presentation/sequence/SequenceRows.tsx')
const proteinSequence = read('src/presentation/protein/ProteinSequencePane.tsx')
const sequenceMinimap = read('src/presentation/sequence/SequenceMinimap.tsx')
const mapZoomMinimap = read('src/presentation/map/MapZoomMinimap.tsx')

describe('scientific renderer contrast regressions', () => {
  it('1 — protein strip uses a thin scientific outline, not chrome borders', () => {
    expect(appCss).toMatch(/\.protein-map-backbone \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);[\s\S]*?stroke-width: 1;/)
    expect(appCss).toMatch(/:root\[data-color-scheme='dark'\] \.protein-map-backbone \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);/)
    expect(appCss).not.toMatch(/\.protein-map-backbone \{[^}]*stroke: none/)
    expect(appCss).not.toMatch(/\.protein-map-backbone \{[^}]*stroke: var\(--vg-border\)/)
  })

  it('2 — linear below-body leaders use scientific leader ink in dark', () => {
    expect(appCss).toMatch(/\.linear-feature-callout-below line \{[\s\S]*?stroke: var\(--vg-scientific-leader-ink\);/)
    expect(appCss).toMatch(/:root\[data-color-scheme='dark'\] \.linear-feature-callout-below line \{[\s\S]*?stroke: var\(--vg-scientific-leader-ink\);/)
  })

  it('3 — circular external feature labels keep scientific label ink in dark', () => {
    expect(appCss).toMatch(/\.feature-callout-external text \{[\s\S]*?fill: var\(--vg-scientific-label-ink\);/)
    expect(appCss).toMatch(/:root\[data-color-scheme='dark'\] \.feature-callout-external text \{[\s\S]*?fill: var\(--vg-scientific-label-ink\);/)
    expect(plasmidMap).toContain('map-label map-label-arc map-label-inner-lumen')
    expect(plasmidMap).toMatch(/fill="var\(--vg-scientific-label-ink\)"/)
    expect(plasmidMap).not.toMatch(/map-label-inner-lumen[\s\S]{0,220}fill="var\(--vg-diagram-surface\)"/)
  })

  it('4 — circular label halo scoping and ruler typography', () => {
    expect(appCss).toMatch(/\.map-label-off-body \{[\s\S]*?stroke: var\(--vg-scientific-label-halo\);/)
    expect(appCss).not.toMatch(/\.map-label \{[^}]*stroke:/)
    expect(appCss).not.toMatch(/\.map-label \{[^}]*paint-order:/)
    expect(plasmidMap).toContain('map-label map-label-arc map-label-in-body')
    expect(plasmidMap).toMatch(/className="map-ruler-label map-label-arc map-label-off-body"/)
    expect(plasmidMap).toMatch(/className="map-ruler-segment-label map-label-arc"/)
    expect(plasmidMap).not.toMatch(/map-ruler-label[\s\S]{0,120}map-label map-label-arc/)
    expect(plasmidMap).not.toMatch(/map-ruler-segment-label[\s\S]{0,120}map-label-off-body/)
  })

  it('5 — protein sequence feature tracks use contrastTextColor inline', () => {
    expect(proteinSequence).toMatch(/backgroundColor: feature\.color,\s*\n\s*color: contrastTextColor\(feature\.color\)/)
    expect(appCss).toMatch(/\.protein-feature-track \{[\s\S]*?color: var\(--vg-text\);/)
  })

  it('6 — circular selection limiters use scientific selection ink', () => {
    expect(appCss).toMatch(/\.clock-hand \{[\s\S]*?stroke: var\(--vg-scientific-selection-ink\);/)
    expect(appCss).toMatch(/\.clock-hand\.start \{[\s\S]*?stroke: var\(--vg-scientific-selection-ink\);/)
  })

  it('7 — sequence enzyme cut overlay uses scientific cut ink', () => {
    expect(appCss).toMatch(/\.sequence-cut-tick \{[\s\S]*?stroke: var\(--vg-scientific-cut-ink\);/)
    expect(appCss).toMatch(/\.sequence-cut-bridge \{[\s\S]*?stroke: var\(--vg-scientific-cut-ink\);/)
    expect(indexCss).toMatch(/--vg-scientific-cut-ink: #dc2626;/)
    expect(indexCss).toMatch(/:root\[data-color-scheme='dark'\][\s\S]*--vg-scientific-cut-ink: #f87171;/)
  })

  it('8 — sequence minimap caret uses scientific ruler ink', () => {
    expect(appCss).toMatch(/\.sequence-minimap-caret \{[\s\S]*?stroke: var\(--vg-scientific-ruler-ink\);/)
    expect(appCss).toMatch(/\.sequence-minimap-enzyme-tick \{[\s\S]*?stroke: var\(--vg-scientific-ruler-ink\);/)
    expect(appCss).toMatch(/:root\[data-color-scheme='dark'\] \.sequence-minimap-enzyme-tick \{[\s\S]*?stroke: var\(--vg-scientific-ruler-ink\);/)
  })

  it('9 — hovered sequence enzyme name matches map hover blue', () => {
    expect(appCss).toMatch(
      /\.sequence-enzyme-callout\.is-hovered text\.enzyme-callout-name:not\(\.is-blunt-green\) \{[\s\S]*?fill: #075fa8;/,
    )
    expect(appCss).toMatch(
      /:root\[data-color-scheme='dark'\] \.sequence-enzyme-callout\.is-hovered text\.enzyme-callout-name:not\(\.is-blunt-green\) \{[\s\S]*?fill: var\(--vg-scientific-selection-ink\);/,
    )
    expect(sequenceRows).not.toContain('sequence-enzyme-label-frame')
  })

  it('10 — sequence minimap feature frames use scientific outline ink', () => {
    expect(appCss).toMatch(/\.sequence-minimap-feature \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);/)
    expect(appCss).toMatch(/:root\[data-color-scheme='dark'\] \.sequence-minimap-feature \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);/)
    expect(sequenceMinimap).toContain("'var(--vg-scientific-outline-ink)'")
    expect(mapZoomMinimap).toContain("'var(--vg-scientific-outline-ink)'")
  })

  it('11 — enzyme Lines minimap structural strokes use scientific ruler ink', () => {
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.enzyme-site-minimap-line:not\(\.is-selected\) \{[\s\S]*?stroke: var\(--vg-scientific-ruler-ink\);/,
    )
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.enzyme-site-minimap-line\.is-selected \{[\s\S]*?stroke: var\(--vg-data-mark-selected\);/,
    )
  })

  it('11b — enzyme Lines strip track uses outline stroke on data-track fill', () => {
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.enzyme-site-minimap-track \{[\s\S]*?fill: var\(--vg-data-track\);[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);[\s\S]*?stroke-width: 1;/,
    )
    expect(appCss).toMatch(
      /\.enzyme-site-minimap-track \{[\s\S]*?stroke: var\(--vg-scientific-outline-ink\);[\s\S]*?vector-effect: non-scaling-stroke;/,
    )
    const trackBlock = appCss.match(/:root\[data-color-scheme\] \.enzyme-site-minimap-track \{[^}]+\}/)?.[0] ?? ''
    const lineBlock = appCss.match(/:root\[data-color-scheme\] \.enzyme-site-minimap-line:not\(\.is-selected\) \{[^}]+\}/)?.[0] ?? ''
    expect(trackBlock).toContain('.enzyme-site-minimap-track')
    expect(lineBlock).toContain('.enzyme-site-minimap-line')
    expect(trackBlock).not.toContain('enzyme-site-minimap-line')
  })

  it('12 — primer editor anneal/overhang and caret use scientific roles', () => {
    expect(appCss).toMatch(/\.primer-editor-sequence-highlight \.is-annealed \{[\s\S]*?color: var\(--vg-scientific-label-ink\);/)
    expect(appCss).toMatch(/\.primer-editor-sequence-highlight \.is-overhang \{[\s\S]*?color: #dc2626;/)
    expect(appCss).toMatch(/\.primer-editor-sequence \{[\s\S]*?caret-color: var\(--vg-scientific-label-ink\);/)
    expect(appCss).toMatch(/\.primer-properties-sequence-field \.primer-properties-sequence \{[\s\S]*?color: transparent;/)
  })

  it('12b — primer properties sequence input outranks dialog field remint', () => {
    const dialogRemint = appCss.indexOf(
      ":root[data-color-scheme] .primer-properties-dialog :is(input:not([type='color']), select, textarea)",
    )
    const roleDialogRemint = appCss.indexOf(
      ":root[data-color-scheme] [role='dialog'] :is(input:not([type='color']), select, textarea)",
    )
    const propertiesWin = appCss.indexOf(
      ':root[data-color-scheme] .primer-properties-dialog .primer-properties-sequence-field .primer-properties-sequence',
    )
    expect(dialogRemint).toBeGreaterThan(-1)
    expect(roleDialogRemint).toBeGreaterThan(-1)
    expect(propertiesWin).toBeGreaterThan(dialogRemint)
    expect(propertiesWin).toBeGreaterThan(roleDialogRemint)
    expect(appCss).toMatch(
      /:root\[data-color-scheme\] \.primer-properties-dialog \.primer-properties-sequence-field \.primer-properties-sequence \{[\s\S]*?color: transparent;[\s\S]*?background-color: transparent;[\s\S]*?caret-color: var\(--vg-scientific-label-ink\);/,
    )
  })
})
