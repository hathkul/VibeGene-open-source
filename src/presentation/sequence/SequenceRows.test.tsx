// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import { cloneFixture } from '../../domain/fixtures'
import { defaultFeatureTranslationOptions } from '../../domain/geneticCode'
import { buildPrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { insertionGapLeftPx } from '../../domain/traceDisplay'
import type { PrimerBindingLayout } from '../../domain/types'
import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { defaultDisplaySettings } from './sequenceShared'
import { SequenceRows } from './SequenceRows'

const complementBase = (base: string) =>
  ({ A: 'T', C: 'G', G: 'C', T: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', D: 'H', V: 'B', N: 'N' } as Record<string, string>)[
    base.toUpperCase()
  ] ?? 'N'

function translatedRecord() {
  const fixture = cloneFixture()
  return {
    ...fixture,
    topology: 'linear' as const,
    sequence: 'ATGTGGTAC',
    features: [
      {
        id: 'cds',
        name: 'translated feature',
        type: 'CDS',
        color: themeFixturePalette.bluePrimary,
        locations: [{ start: 0, end: 9, strand: 'forward' as const }],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(1),
      },
    ],
    primers: [],
  }
}

describe('SequenceRows translation selection', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.unstubAllGlobals()
  })

  it('places the reference caret on either edge of a trace insertion gap', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const record = { ...translatedRecord(), sequence: 'ACGT', features: [] }
    const layout = { templateLength: 4, anchorInsertionCounts: new Map([[1, 2]]), insertionPrefixByTemplate: new Uint32Array([0, 0, 2, 2, 2]) }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
      return <SequenceRows record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={[]}
        displaySettings={defaultDisplaySettings} enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null}
        cutStrandSelection={null} selectedRange={selectedRange} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        horizontalMode horizontalRenderFullSequence alignmentMergedLayout={layout}
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()} onRangeSelect={setSelectedRange} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()} />
    }
    act(() => root.render(<Harness />))
    const block = host.querySelector<HTMLDivElement>('.sequence-strand-block')!
    expect(block).toBeTruthy()
    const left = insertionGapLeftPx(layout, 1, 0)
    for (const [x, expected] of [[left + 1, left], [left + 19, left + 20]]) {
      act(() => block.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: x })))
      act(() => block.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: x })))
      const marker = host.querySelector<HTMLElement>('.sequence-bases-alignment-layout .sequence-caret-marker')
      expect(marker?.style.left).toBe(`${expected}px`)
      expect(marker?.style.height).not.toBe('')
    }
  })

  it('draws a reverse primer letter above the template base it pairs with', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
    const template = 'GGACCTGGCTGAAATCCTGCAACCGATCGGAGAG'
    const record = {
      ...translatedRecord(),
      sequence: template,
      features: [],
    }
    // A reverse primer whose `GATC` duplex is its own reverse complement, so it reads
    // both as a top-strand projection and as the written oligo.
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 0,
      templateEnd: 34,
      components: [
        { primerBases: 'CTCTCC', templateStart: 28, templateEnd: 34 },
        { primerBases: 'A' },
        { primerBases: 'GATC', templateStart: 24, templateEnd: 28 },
        { primerBases: 'T' },
        { primerBases: 'GGTTGCAGGATTTCAGCCAGGTCC', templateStart: 0, templateEnd: 24 },
      ],
    }
    const primerFrameDisplays = [
      buildPrimerFrameDisplay(
        { id: 'reverse-1', name: 'R1', sequence: 'CTCTCCAGATCTGGTTGCAGGATTTCAGCCAGGTCC', color: themeFixturePalette.purple },
        template,
        layout,
      ),
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

    const letters = [...host.querySelectorAll<SVGTextElement>('.sequence-primer-base')]
    const glyphs = primerFrameDisplays[0]!.glyphs.filter((glyph) => glyph.kind !== 'template-gap')
    expect(letters).toHaveLength(glyphs.length)

    // Every drawn letter is the complement of the template base it is drawn above.
    for (const [index, letter] of letters.entries()) {
      const glyph = glyphs[index]!
      expect(letter.textContent).toBe(glyph.char)
      if (glyph.templateIndex === undefined) continue
      expect(letter.textContent).toBe(complementBase(template[glyph.templateIndex]!))
    }

    // The letter positions follow the template: a duplex drawn on the wrong reading
    // would sit at a different template position than the base it pairs with.
    const placed = letters
      .map((letter, index) => ({
        x: Number.parseFloat(letter.getAttribute('x') ?? ''),
        templateIndex: glyphs[index]!.templateIndex,
      }))
      .filter((entry): entry is { x: number; templateIndex: number } => entry.templateIndex !== undefined)
    const step = (placed[placed.length - 1]!.x - placed[0]!.x) /
      (placed[placed.length - 1]!.templateIndex - placed[0]!.templateIndex)
    expect(Math.abs(step)).toBeGreaterThan(0)
    const originX = placed[0]!.x - placed[0]!.templateIndex * step
    for (const entry of placed) {
      expect(entry.x).toBeCloseTo(originX + entry.templateIndex * step, 6)
    }

    // The reverse overlay is mounted inside the feature lane, which already owns
    // the 28px track margin. Its local glyph coordinates must therefore match the
    // base-cell centers without adding that margin a second time.
    expect(placed[0]!.x).toBeCloseTo((placed[0]!.templateIndex + 0.5) * 10, 6)
    expect(step).toBeCloseTo(10, 6)
  })

  it('shows brackets at the boundaries of a hovered feature segment', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
    const record = {
      ...translatedRecord(),
      sequence: 'ACGTACGTACGT',
      features: [{
        id: 'feature-1',
        name: 'Hinge',
        type: 'misc_feature',
        color: themeFixturePalette.bluePrimary,
        locations: [{ start: 2, end: 8, strand: 'forward' as const }],
      }],
      primers: [],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record}
        motifHits={[]}
        restrictionSites={[]}
        primerFrameDisplays={[]}
        annotationFeatures={record.features}
        displaySettings={defaultDisplaySettings}
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

    const feature = host.querySelector<HTMLButtonElement>('.sequence-feature-segment')
    expect(feature).not.toBeNull()
    act(() => feature!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    expect(host.querySelectorAll('.sequence-feature-hover-bracket')).toHaveLength(2)
    expect(host.querySelector('.sequence-feature-hover-bracket.is-left')?.getAttribute('style')).toContain('left:')
    act(() => feature!.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })))
    expect(host.querySelectorAll('.sequence-feature-hover-bracket')).toHaveLength(0)
  })

  it('does not bracket row-wrap points inside a hovered feature', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
    const record = {
      ...translatedRecord(),
      sequence: 'ACGT'.repeat(30),
      features: [{
        id: 'long-feature',
        name: 'Long feature',
        type: 'misc_feature',
        color: themeFixturePalette.bluePrimary,
        locations: [{ start: 2, end: 100, strand: 'forward' as const }],
      }],
      primers: [],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record}
        motifHits={[]}
        restrictionSites={[]}
        primerFrameDisplays={[]}
        annotationFeatures={record.features}
        displaySettings={defaultDisplaySettings}
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

    const feature = host.querySelector<HTMLButtonElement>('.sequence-feature-segment')
    expect(feature).not.toBeNull()
    act(() => feature!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    const brackets = [...host.querySelectorAll('.sequence-feature-hover-brackets')]
    expect(brackets.filter((entry) => entry.querySelectorAll('.sequence-feature-hover-bracket').length > 0)).toHaveLength(2)
    expect(brackets.map((entry) => entry.querySelectorAll('.sequence-feature-hover-bracket').length)).toEqual([1, 1])
  })

  it('drags across translation glyphs to select their canonical amino-acid span and DNA bases', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const onRangeSelect = vi.fn()
    const record = translatedRecord()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record}
        motifHits={[]}
        restrictionSites={[]}
        primerFrameDisplays={[]}
        annotationFeatures={record.features}
        displaySettings={{
          ...defaultDisplaySettings,
          enzymes: { ...defaultDisplaySettings.enzymes, visible: false },
          primers: { ...defaultDisplaySettings.primers, visible: false, sgRnasVisible: false },
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
        onRangeSelect={onRangeSelect}
        onPrimerEdit={vi.fn()}
        onEnzymeInfo={vi.fn()}
      />,
    ))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    expect([...residues].map((element) => element.textContent)).toEqual(['M', 'W', 'Y'])
    expect(residues[0]!.title).toBe('translated feature\nMethionine 1')
    expect(residues[1]!.title).toBe('translated feature\nTryptophan 2')
    expect([...residues].every((element) => !element.classList.contains('is-reverse'))).toBe(true)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    expect(host.querySelectorAll('.strand-line:not(.complement) .sequence-codon-hover')).toHaveLength(3)
    expect(host.querySelectorAll('.strand-line.complement .sequence-codon-hover')).toHaveLength(0)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })))
    expect(host.querySelectorAll('.sequence-codon-hover')).toHaveLength(0)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))

    expect(onRangeSelect).toHaveBeenLastCalledWith({ start: 0, end: 9 }, undefined)
  })

  it.each(['forward', 'reverse'] as const)('highlights the %s ORF codon and selects its translated span', (strand) => {
    vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const onRangeSelect = vi.fn()
    const record = {
      ...translatedRecord(),
      features: [{
        id: 'orf:forward:0:0-9', name: 'ORF +1 (3 aa)', type: 'ORF', color: themeFixturePalette.bluePrimary,
        locations: [{ start: 0, end: 9, strand }],
        translateInSequenceView: true, translation: defaultFeatureTranslationOptions(1),
      }],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
        orfTranslationByFeatureId={new Map([['orf:forward:0:0-9', [
          { aa: 'M', number: 1, positions: [0, 1, 2] },
          { aa: 'W', number: 2, positions: [3, 4, 5] },
          { aa: '*', number: 3, positions: [6, 7, 8] },
        ]]])}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()} onRangeSelect={onRangeSelect} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))

    const residues = host.querySelectorAll<HTMLElement>('.sequence-orf-residue')
    expect([...residues].map((element) => element.textContent)).toEqual(['M', 'W', '*'])
    expect(residues[0]!.title).toBe('ORF +1 (3 aa)\nMethionine 1')
    expect(residues[2]!.title).toBe('ORF +1 (3 aa)\nStop 3')
    expect([...residues].every((element) => element.classList.contains('is-reverse') === (strand === 'reverse'))).toBe(true)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    expect(host.querySelectorAll(`.strand-line${strand === 'reverse' ? '.complement' : ':not(.complement)'} .sequence-codon-hover`)).toHaveLength(3)
    expect(host.querySelectorAll(`.strand-line${strand === 'reverse' ? ':not(.complement)' : '.complement'} .sequence-codon-hover`)).toHaveLength(0)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
    expect(onRangeSelect).toHaveBeenLastCalledWith({ start: 0, end: 9 }, undefined)
  })

  it('marks reverse-strand translation residues so their tiles point left', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const source = translatedRecord()
    const record = {
      ...source,
      features: source.features.map((feature) => ({
        ...feature,
        translation: { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const },
      })),
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()} onRangeSelect={vi.fn()} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))
    const residues = [...host.querySelectorAll('.sequence-translation-residue')]
    expect(residues.length).toBeGreaterThan(0)
    expect(residues.every((residue) => residue.classList.contains('is-reverse'))).toBe(true)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    expect(host.querySelectorAll('.strand-line.complement .sequence-codon-hover')).toHaveLength(3)
    expect(host.querySelectorAll('.strand-line:not(.complement) .sequence-codon-hover')).toHaveLength(0)
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })))
    expect(host.querySelectorAll('.sequence-codon-hover')).toHaveLength(0)
  })

  it('keeps the dragged translation selection when the context menu is opened', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const onRangeSelect = vi.fn()
    const record = translatedRecord()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()} onRangeSelect={onRangeSelect} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
    const callsAfterDrag = onRangeSelect.mock.calls.length

    // A secondary press opens the context menu and must not reselect.
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2, buttons: 2 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })))

    expect(onRangeSelect.mock.calls.length).toBe(callsAfterDrag)
    expect(onRangeSelect).toHaveBeenLastCalledWith({ start: 0, end: 9 }, undefined)
    expect(host.querySelector('.sequence-translation-context-menu')).not.toBeNull()
  })

  it('keeps the dragged translation selection when a macOS ctrl-click opens the context menu', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
    const onRangeSelect = vi.fn()
    const record = translatedRecord()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()} onRangeSelect={onRangeSelect} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[2]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
    const callsAfterDrag = onRangeSelect.mock.calls.length

    // macOS reports Ctrl+Click as a primary-button press with the modifier held.
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, ctrlKey: true })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 0, ctrlKey: true })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ctrlKey: true })))

    expect(onRangeSelect.mock.calls.length).toBe(callsAfterDrag)
    expect(onRangeSelect).toHaveBeenLastCalledWith({ start: 0, end: 9 }, undefined)
    expect(host.querySelector('.sequence-translation-context-menu')).not.toBeNull()
  })

  it('copies the dragged translation selection after opening the context menu', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const record = translatedRecord()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
      return (
        <SequenceRows
          record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
          displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
          enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
          selectedRange={selectedRange} selectedFeatureId={null} selectedPrimerId={null} layoutActive
          onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
          onRestrictionHover={vi.fn()} onRangeSelect={(range) => setSelectedRange(range)} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
        />
      )
    }

    act(() => root.render(<Harness />))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[1]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[1]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))

    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2, buttons: 2 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })))

    const copyItem = Array.from(host.querySelectorAll<HTMLButtonElement>('.sequence-translation-context-menu button'))
      .find((button) => button.textContent === 'Copy translation')!
    expect(copyItem).toBeDefined()
    await act(async () => copyItem.click())

    // The dragged range covers residues M and W, not the whole feature.
    expect(writeText).toHaveBeenCalledWith('MW')
  })

  it('copies a translation selection that spans two in-frame translated features', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    // Two in-frame CDS features with no stop codon between them, so their
    // translations merge into one continuous reading frame.
    const record = {
      ...translatedRecord(),
      sequence: 'ATGTGGTACAAATGTGGTAC',
      features: [
        {
          id: 'cds-a', name: 'upstream CDS', type: 'CDS', color: themeFixturePalette.bluePrimary,
          locations: [{ start: 0, end: 8, strand: 'forward' as const }],
          translateInSequenceView: true, translation: defaultFeatureTranslationOptions(1),
        },
        {
          id: 'cds-b', name: 'downstream CDS', type: 'CDS', color: themeFixturePalette.purple,
          locations: [{ start: 9, end: 20, strand: 'forward' as const }],
          translateInSequenceView: true, translation: defaultFeatureTranslationOptions(1),
        },
      ],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
      return (
        <SequenceRows
          record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
          displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
          enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
          selectedRange={selectedRange} selectedFeatureId={null} selectedPrimerId={null} layoutActive
          onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
          onRestrictionHover={vi.fn()} onRangeSelect={(range) => setSelectedRange(range)} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
        />
      )
    }

    act(() => root.render(<Harness />))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    expect(residues.length).toBeGreaterThan(3)

    // Drag from the first residue to the last one, across the feature boundary.
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[residues.length - 1]!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[residues.length - 1]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))

    const expected = [...residues].map((element) => element.textContent).join('')
    expect(expected.length).toBeGreaterThan(3)

    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2, buttons: 2 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })))

    const copyItem = Array.from(host.querySelectorAll<HTMLButtonElement>('.sequence-translation-context-menu button'))
      .find((button) => button.textContent === 'Copy translation')!
    expect(copyItem).toBeDefined()
    await act(async () => copyItem.click())

    // The whole selected stretch must be copied, including both features.
    expect(writeText).toHaveBeenCalledWith(expected)
  })

  it('does not render hidden feature or translation bodies', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const record = translatedRecord()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
        displaySettings={{ ...defaultDisplaySettings, features: { ...defaultDisplaySettings.features, visible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
        onRestrictionHover={vi.fn()} onRangeSelect={vi.fn()} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))
    expect(host.querySelectorAll('.sequence-feature-segment, .sequence-translation-residue')).toHaveLength(0)
  })

  it('keeps one merged-layout glyph for a cell with an existing layout span', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const record = {
      ...translatedRecord(),
      sequence: 'ATGCNNNNNNAA',
      features: [{
        id: 'cds', name: 'multipart translated feature', type: 'CDS', color: themeFixturePalette.bluePrimary,
        locations: [
          { start: 0, end: 4, strand: 'forward' as const },
          { start: 10, end: 12, strand: 'forward' as const },
        ],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(2),
      }],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record}
        motifHits={[]}
        restrictionSites={[]}
        primerFrameDisplays={[]}
        annotationFeatures={record.features}
        translationByFeatureIdOverride={new Map([['cds', [{ aa: 'Q', number: 2, positions: [3, 10, 11], layoutSpan: { leftPx: 30, widthPx: 20 } }]]])}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
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

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    expect(residues).toHaveLength(1)
    expect(residues[0]?.style.left).toBe('30px')
    expect(residues[0]?.style.width).toBe('20px')
  })

  it('selects only the clicked fragment of an amino acid that spans a segment boundary', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const onRangeSelect = vi.fn()
    const record = {
      ...translatedRecord(),
      sequence: 'ATGCNNNNNNAA',
      features: [{
        id: 'cds', name: 'multipart translated feature', type: 'CDS', color: themeFixturePalette.bluePrimary,
        locations: [
          { start: 0, end: 4, strand: 'forward' as const },
          { start: 10, end: 12, strand: 'forward' as const },
        ],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(2),
      }],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record}
        motifHits={[]}
        restrictionSites={[]}
        primerFrameDisplays={[]}
        annotationFeatures={record.features}
        translationByFeatureIdOverride={new Map([['cds', [{ aa: 'Q', number: 2, positions: [3, 10, 11] }]]])}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
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
        onRangeSelect={onRangeSelect}
        onPrimerEdit={vi.fn()}
        onEnzymeInfo={vi.fn()}
      />,
    ))

    // The spanning codon is drawn once per segment.
    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    expect(residues).toHaveLength(2)

    // Clicking the first fragment must not select the bases between segments.
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })))
    expect(onRangeSelect).toHaveBeenLastCalledWith({ start: 3, end: 4 }, undefined)

    // Clicking the second fragment selects only the bases under it.
    onRangeSelect.mockClear()
    act(() => residues[1]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[1]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
    act(() => residues[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })))
    expect(onRangeSelect).toHaveBeenLastCalledWith({ start: 10, end: 12 }, undefined)
  })

  it('copies a segment-spanning amino acid exactly once after clicking one of its fragments', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const record = {
      ...translatedRecord(),
      sequence: 'ATGCNNNNNNAA',
      features: [{
        id: 'cds', name: 'multipart translated feature', type: 'CDS', color: themeFixturePalette.bluePrimary,
        locations: [
          { start: 0, end: 4, strand: 'forward' as const },
          { start: 10, end: 12, strand: 'forward' as const },
        ],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(2),
      }],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
      return (
        <SequenceRows
          record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
          translationByFeatureIdOverride={new Map([['cds', [{ aa: 'Q', number: 2, positions: [3, 10, 11] }]]])}
          displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
          enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
          selectedRange={selectedRange} selectedFeatureId={null} selectedPrimerId={null} layoutActive
          onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
          onRestrictionHover={vi.fn()} onRangeSelect={(range) => setSelectedRange(range)} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
        />
      )
    }

    act(() => root.render(<Harness />))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    expect(residues).toHaveLength(2)

    // Click the first fragment of the spanning codon.
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))

    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2, buttons: 2 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })))

    const copyItem = Array.from(host.querySelectorAll<HTMLButtonElement>('.sequence-translation-context-menu button'))
      .find((button) => button.textContent === 'Copy translation')!
    expect(copyItem).toBeDefined()
    await act(async () => copyItem.click())

    // The spanning codon is one amino acid, not one per fragment.
    expect(writeText).toHaveBeenCalledWith('Q')
  })

  it('highlights only the drawn fragment of a segment-spanning amino acid', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const record = {
      ...translatedRecord(),
      sequence: 'ATGCNNNNNNAA',
      features: [{
        id: 'cds', name: 'multipart translated feature', type: 'CDS', color: themeFixturePalette.bluePrimary,
        locations: [
          { start: 0, end: 4, strand: 'forward' as const },
          { start: 10, end: 12, strand: 'forward' as const },
        ],
        translateInSequenceView: true,
        translation: defaultFeatureTranslationOptions(2),
      }],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
      return (
        <SequenceRows
          record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
          translationByFeatureIdOverride={new Map([['cds', [{ aa: 'Q', number: 2, positions: [3, 10, 11] }]]])}
          displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
          enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
          selectedRange={selectedRange} selectedFeatureId={null} selectedPrimerId={null} layoutActive
          onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()} onRestrictionSelect={vi.fn()}
          onRestrictionHover={vi.fn()} onRangeSelect={(range) => setSelectedRange(range)} onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
        />
      )
    }

    act(() => root.render(<Harness />))

    const residues = host.querySelectorAll<HTMLButtonElement>('.sequence-translation-residue')
    expect(residues).toHaveLength(2)

    // Click the first fragment: only that glyph is highlighted.
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })))
    act(() => residues[0]!.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
    expect(residues[0]!.classList.contains('selected')).toBe(true)
    expect(residues[1]!.classList.contains('selected')).toBe(false)
  })

  it('reserves row height for labels below feature bodies without primers', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const record = {
      ...translatedRecord(), sequence: 'A'.repeat(100),
      features: [{ id: 'short', name: 'A long feature label', type: 'misc_feature', color: themeFixturePalette.bluePrimary, locations: [{ start: 10, end: 12, strand: 'forward' as const }] }],
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={[]} annotationFeatures={record.features}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()}
        onRestrictionSelect={vi.fn()} onRestrictionHover={vi.fn()} onRangeSelect={vi.fn()}
        onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))
    const label = host.querySelector<HTMLElement>('.sequence-feature-floating-label.is-below')!
    expect(label).not.toBeNull()
    const top = parseFloat(label.style.getPropertyValue('--feature-lane-top'))
    const bodyHeight = parseFloat(label.style.getPropertyValue('--feature-body-height'))
    const level = Number(label.style.getPropertyValue('--below-level'))
    const labelBottom = top + 1 + bodyHeight + 2 + level * 12 + 13.2
    const featureLane = label.closest<HTMLElement>('.sequence-feature-lane')!
    expect(parseFloat(featureLane.style.height)).toBeGreaterThanOrEqual(labelBottom)
  })

  it('keeps raised labels in the top forward primer lane below the row boundary', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    const record = { ...translatedRecord(), sequence: 'A'.repeat(100), features: [] }
    const layout: PrimerBindingLayout = {
      strand: 'forward', templateStart: 10, templateEnd: 18,
      components: [{ primerBases: 'TGTGTGTG', templateStart: 10, templateEnd: 18 }],
    }
    const primerFrameDisplays = [0, 1, 2].map((index) => buildPrimerFrameDisplay(
      { id: `p${index}`, name: `VeryLongPrimerNameHere${index}`, sequence: 'TGTGTGTG', color: themeFixturePalette.purple },
      record.sequence, layout,
    ))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <SequenceRows
        record={record} motifHits={[]} restrictionSites={[]} primerFrameDisplays={primerFrameDisplays}
        annotationFeatures={record.features}
        displaySettings={{ ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: false }, primers: { ...defaultDisplaySettings.primers, visible: true, sgRnasVisible: false } }}
        enzymePreferences={defaultEnzymePreferences} hoveredRestrictionSiteKey={null} cutStrandSelection={null}
        selectedRange={null} selectedFeatureId={null} selectedPrimerId={null} layoutActive
        onFeatureSelect={vi.fn()} onFeatureEdit={vi.fn()} onPrimerSelect={vi.fn()}
        onRestrictionSelect={vi.fn()} onRestrictionHover={vi.fn()} onRangeSelect={vi.fn()}
        onPrimerEdit={vi.fn()} onEnzymeInfo={vi.fn()}
      />,
    ))
    const frames = [...host.querySelectorAll<SVGGElement>('.sequence-primer-overlay-forward .sequence-primer-frame')]
    expect(frames).toHaveLength(3)
    for (const frame of frames) {
      const label = frame.querySelector<SVGRectElement>('.sequence-primer-name-background')!
      const offset = Number(frame.getAttribute('transform')?.match(/translate\(0, ([\d.]+)\)/)?.[1] ?? 0)
      expect(Number(label.getAttribute('y')) + offset).toBeGreaterThanOrEqual(4)
    }
  })
})
