import { describe, expect, it } from 'vitest'
import { themeFixturePalette } from '../test-support/themeFixturePalette'
import {
  annealMaskFromBindingLayout,
  buildPrimerFrameDisplay,
  dedupePrimerBindingLayouts,
  dedupePrimersBySequence,
  hairpinLoopPath,
  hasComplexPrimerBindings,
  primerArrowFlapPoints,
  primerArrowFramePath,
  primerBindingLayoutRange,
  primerClearanceSpansForRow,
  primerDisplayRowSpan,
  primerEditorAnnealPreview,
  primerPropertiesAnnealPreview,
  primerFirstAnnealedTemplateIndex,
  primerFrameBounds,
  primerFrameMetrics,
  primerFrameMetricsForDisplay,
  primerLaneStackHeight,
  primerFramePaths,
  primerFramePathsNeedBackgroundFill,
  primerGlyphVisibleInRow,
  primerHasIntegratedHairpinFrame,
  primerJunctionConnectorPaths,
  primerLabelMetrics,
  primerLabelStackOverflow,
  primerVisualSpanForRow,
  previewIntegratedPrimerFramePath,
  refineBindingLayoutInserts,
  terminalContinuousMatchLength,
} from './primerSequenceLayout'
import type { Primer, PrimerBindingLayout } from './types'
import type { PrimerFrameDisplay } from './primerLayoutTypes'

const complementBase = (base: string) =>
  ({ A: 'T', C: 'G', G: 'C', T: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', D: 'H', V: 'B', N: 'N' } as Record<string, string>)[
    base.toUpperCase()
  ] ?? 'N'

const layout = (strand: 'forward' | 'reverse' = 'forward'): PrimerBindingLayout => ({
  strand,
  templateStart: 0,
  templateEnd: 12,
  components: [{ primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 }],
})

const primer: Primer = {
  id: 'primer-1',
  name: 'P1',
  sequence: 'ATGCGTACGTAG',
  color: 'primer-color',
}

describe('primer sequence layout façade', () => {
  it('preserves terminal 3′ matching and oligo mask semantics', () => {
    const exact = layout()
    expect(terminalContinuousMatchLength('ATGCGTACGTAG', exact, false)).toBe(12)
    expect(terminalContinuousMatchLength('ATGCGTACGTAA', exact, false)).toBe(0)
    expect(annealMaskFromBindingLayout('ATGCGTACGTAG', primer.sequence, exact)).toEqual(
      Array.from({ length: 12 }, () => true),
    )
    expect(annealMaskFromBindingLayout('ATGCGTACGTAG', primer.sequence, layout('reverse'))).toHaveLength(12)
  })

  it('marks internal mismatches red-class false when the written sequence no longer pairs', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const bindings: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 0,
      templateEnd: 12,
      components: [
        { primerBases: 'TTTTT' },
        { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
      ],
    }
    const sequence = 'TTTTTATGCGTACGTAA'
    const preview = primerPropertiesAnnealPreview(template, sequence, { preferredStrand: 'forward', bindings: [bindings] })
    expect(preview.mask.filter(Boolean).length).toBeLessThan(sequence.length)
    expect(preview.mask[sequence.length - 1]).toBe(false)
    expect(preview.mask.slice(0, 5).every(Boolean)).toBe(false)
    expect(preview.mask.slice(5, 16).filter(Boolean).length).toBeGreaterThan(0)
  })

  it('keeps stored intervals when one matching base is edited to a mismatch', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const bindings: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 0,
      templateEnd: 12,
      components: [
        { primerBases: 'TTTTT' },
        { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
      ],
    }
    const original = 'TTTTTATGCGTACGTAG'
    const edited = 'TTTTTATGCGTACGTAA'
    const preview = primerPropertiesAnnealPreview(template, edited, { preferredStrand: 'forward', bindings: [bindings] })
    expect(preview.mask).toHaveLength(edited.length)
    expect(preview.mask.slice(0, 5).every((paired) => !paired)).toBe(true)
    expect(preview.mask.slice(5, 15).every(Boolean)).toBe(true)
    expect(preview.mask[16]).toBe(false)
    const baseline = primerPropertiesAnnealPreview(template, original, { preferredStrand: 'forward', bindings: [bindings] })
    expect(baseline.mask.slice(5, 16)).toEqual(preview.mask.slice(5, 16))
  })

  it('shows extension, internal mismatch, and annealed neighbors in one mask', () => {
    const template = 'ATGCGTACGTAGCCCCGGGG'
    const bindings: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 0,
      templateEnd: 12,
      components: [
        { primerBases: 'TTTTT' },
        { primerBases: 'ATGCGTACGTAG', templateStart: 0, templateEnd: 12 },
      ],
    }
    const sequence = 'TTTTTATGCGTATGTAG'
    const preview = primerPropertiesAnnealPreview(template, sequence, { preferredStrand: 'forward', bindings: [bindings] })
    expect(preview.mask.slice(0, 5).every((paired) => !paired)).toBe(true)
    expect(preview.mask[12]).toBe(false)
    expect(preview.mask[11]).toBe(true)
    expect(preview.mask[13]).toBe(true)
  })

  it('retains display, binding maintenance, identity and range behavior', () => {
    const exact = layout()
    const display = buildPrimerFrameDisplay(primer, primer.sequence, exact)
    expect(display.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
    expect(display.templateSpanStart).toBe(0)
    expect(display.templateSpanEnd).toBe(12)
    expect(hasComplexPrimerBindings([exact])).toBe(false)
    expect(primerBindingLayoutRange(exact)).toEqual({ start: 0, end: 12 })
    expect(refineBindingLayoutInserts(primer.sequence, exact)).toEqual(exact)
    expect(dedupePrimerBindingLayouts(primer.sequence, [exact, exact])).toHaveLength(1)
    expect(dedupePrimersBySequence([primer, { ...primer, id: 'primer-2' }], primer.sequence)).toHaveLength(1)
  })

  it('keeps projection, row, bounds and path seams equivalent for a rendered display', () => {
    const display = buildPrimerFrameDisplay(primer, primer.sequence, layout())
    const metrics = primerFrameMetrics(12, 1.2)
    const compact = primerFrameMetricsForDisplay(display, 12, 1.2)
    const bounds = primerFrameBounds(display, 0, 20, 8, 10, metrics, 'forward')
    expect(primerDisplayRowSpan(display)).toBe(1)
    expect(compact.displayRows).toBe(1)
    expect(primerFirstAnnealedTemplateIndex(display)).toBe(0)
    expect(primerGlyphVisibleInRow(display, display.glyphs[0]!, 0, 0, 20)).toBe(true)
    expect(primerVisualSpanForRow(display, 0, 20, 8, 10)).not.toBeNull()
    expect(primerClearanceSpansForRow([display], 0, 20, 8, 10)).toHaveLength(1)
    expect(primerLabelMetrics(display.name).width).toBeGreaterThan(0)
    expect(bounds).not.toBeNull()
    if (!bounds) return

    const paths = primerFramePaths(display, 0, 20, 8, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    expect(paths.fills.length + paths.outlines.length).toBeGreaterThan(0)
    expect(primerFramePathsNeedBackgroundFill({ fills: [], outlines: [] })).toBe(true)
    expect(primerFramePathsNeedBackgroundFill(paths)).toBe(false)
    expect(primerHasIntegratedHairpinFrame(display)).toBe(true)
    expect(primerJunctionConnectorPaths(display, 0, 20, 8, 10, metrics, bounds)).toEqual([])
    expect(previewIntegratedPrimerFramePath(bounds, metrics, 'forward', 10)).toContain('M ')
    expect(primerArrowFramePath(bounds, 'forward', metrics, 10)).toContain('M ')
    expect(hairpinLoopPath(display, bounds, 0, 8, 10, metrics)).toBeNull()
    expect(primerArrowFlapPoints(10, 20, -1, -1, 10, 12).p0x).toBe(10)
  })

  it('does not add forward stack height for a half-shifted terminal overhang', () => {
    const fullyAnnealed = buildPrimerFrameDisplay(primer, primer.sequence, layout())
    const extendedPrimer: Primer = {
      ...primer,
      sequence: 'AC' + primer.sequence,
    }
    const extended = buildPrimerFrameDisplay(
      extendedPrimer,
      extendedPrimer.sequence,
      {
        strand: 'forward',
        templateStart: 0,
        templateEnd: 12,
        components: [
          { primerBases: 'AC' },
          { primerBases: primer.sequence, templateStart: 0, templateEnd: 12 },
        ],
      },
    )
    const fullyAnnealedMetrics = primerFrameMetricsForDisplay(fullyAnnealed, 12, 1.8)
    const extendedMetrics = primerFrameMetricsForDisplay(extended, 12, 1.8)

    expect(extended.glyphs.some((glyph) => glyph.row === 0.5)).toBe(true)
    expect(extendedMetrics.displayRows).toBe(1)
    expect(primerLaneStackHeight(extendedMetrics)).toBe(primerLaneStackHeight(fullyAnnealedMetrics))
  })

  it('uses the same stack height rule for a reverse half-shifted overhang', () => {
    const fullyAnnealed = buildPrimerFrameDisplay({ ...primer, id: 'reverse-full' }, primer.sequence, layout('reverse'))
    const extendedPrimer: Primer = {
      ...primer,
      id: 'reverse-extended',
      sequence: primer.sequence + 'AC',
    }
    const extended = buildPrimerFrameDisplay(
      extendedPrimer,
      extendedPrimer.sequence,
      {
        strand: 'reverse',
        templateStart: 0,
        templateEnd: 12,
        components: [
          { primerBases: primer.sequence, templateStart: 0, templateEnd: 12 },
          { primerBases: 'AC' },
        ],
      },
    )
    const fullyAnnealedMetrics = primerFrameMetricsForDisplay(fullyAnnealed, 12, 1.8)
    const extendedMetrics = primerFrameMetricsForDisplay(extended, 12, 1.8)

    expect(extended.glyphs.some((glyph) => glyph.row === 0.5)).toBe(true)
    expect(extendedMetrics.displayRows).toBe(1)
    expect(primerLaneStackHeight(extendedMetrics, { reverseLabelBelow: true })).toBe(
      primerLaneStackHeight(fullyAnnealedMetrics, { reverseLabelBelow: true }),
    )
  })

  it('reserves label overflow on the correct side of either primer stack', () => {
    const label = primerLabelMetrics('primer')
    const forwardBounds = { left: 0, right: 10, top: 20, bottom: 45, labelX: 5, labelY: 2 }
    const reverseBounds = { left: 0, right: 10, top: 0, bottom: 25, labelX: 5, labelY: 54 }

    expect(primerLabelStackOverflow(forwardBounds, label, 'forward', 49)).toBe(label.halfHeight - 2)
    expect(primerLabelStackOverflow(reverseBounds, label, 'reverse', 49)).toBe(label.halfHeight + 5)
    expect(primerLabelStackOverflow({ ...forwardBounds, labelY: 20 }, label, 'forward', 49)).toBe(0)
    expect(primerLabelStackOverflow({ ...reverseBounds, labelY: 30 }, label, 'reverse', 49)).toBe(0)
  })

  it('reserves an extra body row only for protrusions beyond the arrow envelope', () => {
    const displayWithMaxRow = (maxRow: number): PrimerFrameDisplay => ({
      primerId: 'row-probe',
      name: 'row probe',
      color: themeFixturePalette.black,
      strand: 'forward',
      sequence: 'A',
      glyphs: [{ char: 'A', kind: 'overhang', row: maxRow }],
      templateSpanStart: 0,
      templateSpanEnd: 1,
      selectRange: { start: 0, end: 1 },
    })

    expect(primerFrameMetricsForDisplay(displayWithMaxRow(0.5), 12, 1.8).displayRows).toBe(1)
    expect(primerFrameMetricsForDisplay(displayWithMaxRow(1), 12, 1.8).displayRows).toBe(1)
    expect(primerFrameMetricsForDisplay(displayWithMaxRow(1.5), 12, 1.8).displayRows).toBe(2)
  })

  it('keeps a reverse primer body aligned with its anneal site when one duplex reads both ways', () => {
    // `GATC` is its own reverse complement, so it matches the top strand and the oligo
    // reading equally well. One such duplex inside a reverse primer must not decide the
    // reading of the whole body: doing so shifts the drawn letters off the bases they
    // pair with.
    const template = 'GGACCTGGCTGAAATCCTGCAACCGATCGGAGAG'
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
    const reversePrimer: Primer = {
      id: 'primer-reverse',
      name: 'reverse',
      sequence: 'CTCTCCAGATCTGGTTGCAGGATTTCAGCCAGGTCC',
      color: 'primer-color',
    }

    const display = buildPrimerFrameDisplay(reversePrimer, template, layout)
    const annealed = display.glyphs.filter((glyph) => glyph.kind === 'annealed')
    expect(annealed.length).toBeGreaterThan(0)

    // Every drawn letter is the complement of the template base it sits on.
    for (const glyph of annealed) {
      const templateBase = template[glyph.templateIndex!]!.toUpperCase()
      expect(glyph.char).toBe(complementBase(templateBase))
    }

    // The palindromic duplex follows the oligo's own reading: its letters run along the
    // template the way the written oligo does, not the way the top strand does.
    const palindrome = annealed.filter((glyph) => glyph.templateIndex! >= 24 && glyph.templateIndex! < 28)
    expect(palindrome.map((glyph) => glyph.char).join('')).toBe('GATC')
    expect(palindrome.map((glyph) => glyph.templateIndex)).toEqual([27, 26, 25, 24])
  })

  it('keeps editor preview bounded and façade importable', () => {
    const preview = primerEditorAnnealPreview(primer.sequence, primer.sequence, { preferredStrand: 'forward' })
    expect(preview.mask).toHaveLength(primer.sequence.length)
    expect(preview.annealedCount).toBeGreaterThan(0)
  })
})
