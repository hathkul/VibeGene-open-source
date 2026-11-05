// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import { cloneFixture } from '../../domain/fixtures'
import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { defaultDisplaySettings } from './sequenceShared'
import { SequenceRows } from './SequenceRows'

describe('SequenceRows primer packing', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.unstubAllGlobals()
  })

  it('lets reverse primers reuse feature levels when their row intervals do not overlap', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const fixture = cloneFixture()
    const record = {
      ...fixture,
      sequence: 'A'.repeat(100),
      features: [0, 1].map((index) => ({
        id: `left-feature-${index}`,
        name: `Left feature ${index}`,
        type: 'misc_feature',
        color: themeFixturePalette.bluePrimary,
        locations: [{ start: 0, end: 40, strand: 'forward' as const }],
      })),
    }
    const primerFrameDisplays = [
      { primerId: 'right-0', name: 'R0', color: themeFixturePalette.purple, strand: 'reverse' as const, sequence: 'AAAA', glyphs: [{ char: 'A', kind: 'annealed' as const, row: 0, templateIndex: 65 }], templateSpanStart: 64, templateSpanEnd: 68, selectRange: { start: 64, end: 68 } },
      { primerId: 'right-1', name: 'R1', color: themeFixturePalette.purple, strand: 'reverse' as const, sequence: 'AAAA', glyphs: [{ char: 'A', kind: 'annealed' as const, row: 0, templateIndex: 80 }], templateSpanStart: 79, templateSpanEnd: 83, selectRange: { start: 79, end: 83 } },
      // The drawn frame overlaps the feature's right edge. Its packing span
      // must use the same zero-based coordinates as the reverse SVG frame.
      { primerId: 'left', name: 'L', color: themeFixturePalette.purple, strand: 'reverse' as const, sequence: 'AAAA', glyphs: [{ char: 'A', kind: 'annealed' as const, row: 0, templateIndex: 38 }], templateSpanStart: 37, templateSpanEnd: 41, selectRange: { start: 37, end: 41 } },
    ]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record}
        motifHits={[]}
        restrictionSites={[]}
        primerFrameDisplays={primerFrameDisplays}
        annotationFeatures={record.features}
        maxFeatureRows={1}
        displaySettings={{
          ...defaultDisplaySettings,
          enzymes: { ...defaultDisplaySettings.enzymes, visible: false },
          primers: { ...defaultDisplaySettings.primers, visible: true, sgRnasVisible: false },
        }}
        enzymePreferences={defaultEnzymePreferences}
        hoveredRestrictionSiteKey={null}
        cutStrandSelection={null}
        selectedRange={null}
        selectedFeatureId={null}
        selectedPrimerId={null}
        layoutActive
        onFeatureSelect={vi.fn()}
        onFeatureEdit={vi.fn()}
        onPrimerSelect={vi.fn()}
        onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()}
        onRangeSelect={vi.fn()}
        onPrimerEdit={vi.fn()}
        onEnzymeInfo={vi.fn()}
      />,
    ))

    const primerFrames = host.querySelectorAll<SVGGElement>('.sequence-primer-overlay-reverse .sequence-primer-frame')
    expect(primerFrames).toHaveLength(3)
    const primerTransforms = [...primerFrames].map((frame) => frame.getAttribute('transform'))
    expect(primerTransforms.filter((transform) => transform === null)).toHaveLength(2)
    expect(primerTransforms.find((transform) => transform !== null)).toMatch(/^translate\(0, /)
    expect(host.querySelectorAll('.sequence-feature-segment')).toHaveLength(2)
    const featureLane = host.querySelector<HTMLElement>('.sequence-feature-lane')!
    const rowContent = featureLane.closest<HTMLElement>('.sequence-row-content')!
    // Reverse primers live in the feature lane; the separate lane below is
    // reserved for sgRNAs and must not duplicate the primer/feature height.
    expect(rowContent.style.getPropertyValue('--primer-lane-height')).toBe('0px')
    expect(featureLane.style.overflow).toBe('')
    const cappedFeatureContent = featureLane.querySelector<HTMLElement>(':scope > div')!
    expect(cappedFeatureContent.style.position).toBe('relative')
    expect(cappedFeatureContent.style.overflow).toBe('hidden')
    expect(host.querySelector<SVGSVGElement>('.sequence-primer-overlay-reverse')?.parentElement).toBe(featureLane)
    expect(Number.parseFloat(featureLane.style.height)).toBeGreaterThan(18)
  })
})
