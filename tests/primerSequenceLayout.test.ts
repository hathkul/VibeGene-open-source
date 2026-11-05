import { describe, expect, it } from 'vitest'
import {
  PRIMER_DISPLAY_ROWS,
  PRIMER_ROW_INSERT_SHIFT,
  PRIMER_ROW_HALF_SHIFT,
  buildPrimerFrameDisplay,
  hasDisplayablePrimerAnneal,
  primerClearanceSpansForRow,
  primerFrameBackgroundFillPath,
  primerFrameBounds,
  primerFrameMetrics,
  primerFrameMetricsForDisplay,
  primerLaneStackHeight,
  primerArrowFlapHeightPx,
  primerReverseArrowStackPad,
  primerArrowFlapPoints,
  primerLabelMetrics,
  glyphY,
  primerFramePaths,
  primerFramePathsNeedBackgroundFill,
  primerGlyphX,
  primerVisualSpanForRow,
  primerEditorAnnealPreview,
  annealMaskFromBindingLayout,
  templateX,
  PRIMER_FRAME_EDGE_PAD_RATIO,
  hairpinLoopPath,
  refreshExactPrimerBindings,
  resolveDisplayablePrimerSites,
  resolvePrimerFrameDisplays,
  reconcileImportedBindingLayout,
  bindingLayoutMatchesPrimerSequence,
  primerBindingLayoutRange,
  terminalContinuousMatchLength,
  type PrimerFramePathLayers,
} from '../src/domain/primerSequenceLayout'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { Primer, PrimerBindingLayout, SequenceRecord } from '../src/domain/types'

const metrics = primerFrameMetrics(12, 1.8)

function flattenFrameLayers(layers: PrimerFramePathLayers) {
  return [...layers.fills, ...layers.outlines]
}

function joinFrameLayers(layers: PrimerFramePathLayers) {
  return flattenFrameLayers(layers).join(' ')
}

function makeRecord(sequence: string, primers: Primer[]): SequenceRecord {
  return {
    id: 'seq-1',
    name: 'test',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers,
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

describe('primerSequenceLayout', () => {
  it('builds overhang, annealed, gap, and mismatch glyphs from SnapGene-style components', () => {
    const template = 'A'.repeat(20) + 'GACCACCATGTA' + 'N'.repeat(12) + 'TAGASAGKNNNN' + 'T'.repeat(20)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 20,
      templateEnd: 44,
      components: [
        { primerBases: 'GAACA' },
        { primerBases: 'GACCACCATGTC', templateStart: 20, templateEnd: 32 },
        { primerBases: 'TAGASAGKNNNN', templateStart: 44, templateEnd: 56 },
      ],
    }
    const primer: Primer = { id: 'p1', name: 'AlpVHH3 uni fwd', sequence: 'GAACA...', color: '#7c3aed', bindings: [layout] }
    const display = buildPrimerFrameDisplay(primer, template, layout)

    expect(display.glyphs.slice(0, 5).map((glyph) => glyph.kind)).toEqual([
      'overhang',
      'overhang',
      'overhang',
      'overhang',
      'overhang',
    ])
    expect(display.glyphs.slice(0, 5).every((glyph) => glyph.row === PRIMER_ROW_HALF_SHIFT)).toBe(true)
    expect(display.glyphs[5]).toMatchObject({ kind: 'annealed', char: 'G', templateIndex: 20, row: 0 })
    expect(display.glyphs[16]).toMatchObject({ kind: 'mismatch', char: 'C', templateIndex: 31, row: PRIMER_ROW_HALF_SHIFT })
    expect(display.glyphs.slice(17, 29).every((glyph) => glyph.kind === 'template-gap')).toBe(true)
    expect(display.glyphs[29]).toMatchObject({ kind: 'annealed', char: 'T', templateIndex: 44, row: 0 })
  })

  it('falls back to contiguous binding match when SnapGene bindings are absent', () => {
    const sequence = 'NNNNGACCACCATGTCNNNN'
    const primer: Primer = {
      id: 'p2',
      name: 'simple fwd',
      sequence: 'GACCACCATGTC',
      color: '#7c3aed',
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(sequence, [primer]))
    expect(displays).toHaveLength(1)
    expect(displays[0]?.strand).toBe('forward')
    expect(displays[0]?.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
    expect(displays[0]?.templateSpanStart).toBe(4)
    expect(displays[0]?.templateSpanEnd).toBe(16)
  })

  it('ignores stale complex bindings when the primer sequence no longer matches them', () => {
    const sequence = 'NNNNGACCACCATGTCNNNN'
    const staleLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 4,
      templateEnd: 16,
      components: [
        { primerBases: 'GGGGG' },
        { primerBases: 'GACCACCATGTC', templateStart: 4, templateEnd: 16 },
      ],
    }
    expect(bindingLayoutMatchesPrimerSequence(staleLayout, 'GACCACCATGTC')).toBe(false)
    expect(bindingLayoutMatchesPrimerSequence(staleLayout, 'GGGGGGACCACCATGTC')).toBe(true)

    const primer: Primer = {
      id: 'p-stale',
      name: 'edited',
      sequence: 'GACCACCATGTC',
      color: '#7c3aed',
      bindings: [staleLayout],
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(sequence, [primer]))
    expect(displays).toHaveLength(1)
    expect(displays[0]?.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
    expect(displays[0]?.glyphs.map((glyph) => glyph.char).join('')).toBe('GACCACCATGTC')
    expect(displays[0]?.glyphs.some((glyph) => glyph.kind === 'overhang')).toBe(false)
  })

  it('prefers exact duplex over mutagenic complex bindings once the product matches', () => {
    // Parental SnapGene-style layout: substitution encoded as insert + skipped template base.
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const oligo = `${left}A${right}`
    const product = `NNNN${oligo}NNNN`
    const mutagenicLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 4,
      templateEnd: 4 + oligo.length,
      components: [
        { primerBases: left, templateStart: 4, templateEnd: 4 + left.length },
        { primerBases: 'A' },
        {
          primerBases: right,
          templateStart: 4 + left.length + 1,
          templateEnd: 4 + oligo.length,
        },
      ],
    }
    const primer: Primer = {
      id: 'mut-product',
      name: 'Mut fwd',
      sequence: oligo,
      color: '#2563eb',
      bindings: [mutagenicLayout],
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(product, [primer]))
    expect(displays).toHaveLength(1)
    expect(displays[0]?.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
    expect(displays[0]?.glyphs.some((glyph) => glyph.kind === 'mismatch' || glyph.kind === 'insert')).toBe(
      false,
    )
  })

  it('refreshes overhang primers that share mutations even without a full exact duplex', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const anneal = `${left}A${right}`
    const oligo = `GGGG${anneal}`
    const product = `NNNN${anneal}NNNN`
    const mutagenicLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 4,
      templateEnd: 4 + anneal.length,
      components: [
        { primerBases: 'GGGG' },
        { primerBases: left, templateStart: 4, templateEnd: 4 + left.length },
        { primerBases: 'A' },
        {
          primerBases: right,
          templateStart: 4 + left.length + 1,
          templateEnd: 4 + anneal.length,
        },
      ],
    }
    const primer: Primer = {
      id: 'mut-overhang',
      name: 'Mut overhang',
      sequence: oligo,
      color: '#2563eb',
      bindings: [mutagenicLayout],
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(product, [primer]))
    expect(displays.length).toBeGreaterThan(0)
    expect(displays.every((display) => !display.glyphs.some((glyph) => glyph.kind === 'insert'))).toBe(
      true,
    )
    expect(
      displays.some((display) =>
        display.glyphs.filter((glyph) => glyph.kind === 'annealed').length >= anneal.length - 2,
      ),
    ).toBe(true)
    expect(displays.some((display) => display.glyphs.some((glyph) => glyph.kind === 'overhang'))).toBe(
      true,
    )

    const refreshed = refreshExactPrimerBindings([primer], product)
    expect(refreshed[0]!.bindings?.length).toBeGreaterThan(0)
    const refreshedDisplay = buildPrimerFrameDisplay(
      refreshed[0]!,
      product,
      refreshed[0]!.bindings![0]!,
    )
    expect(refreshedDisplay.glyphs.some((glyph) => glyph.kind === 'insert')).toBe(false)
    expect(refreshedDisplay.glyphs.some((glyph) => glyph.kind === 'annealed')).toBe(true)
  })

  it('paints a 3-prime terminal mismatch as mismatch, not annealed overhang', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const product = `NNNN${annealed.slice(0, -1)}A${'N'.repeat(4)}`
    const primer: Primer = {
      id: 'term-mm',
      name: 'term',
      sequence: annealed,
      color: '#2563eb',
    }
    // Layout may resolve with the 3′ mismatch inside the duplex, but hybridization rules
    // require a matching 3′ terminus — so the site is not displayed.
    const displays = resolvePrimerFrameDisplays(makeRecord(product, [primer]))
    expect(displays).toEqual([])
  })

  it('does not display a primer whose 3-prime terminus mismatches the template', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `NNNN${annealed.slice(0, -1)}C${'N'.repeat(4)}`
    const primer: Primer = {
      id: 'term-mm-stored',
      name: 'term stored',
      sequence: annealed,
      color: '#2563eb',
      bindings: [
        {
          strand: 'forward',
          templateStart: 4,
          templateEnd: 24,
          components: [{ primerBases: annealed, templateStart: 4, templateEnd: 24 }],
        },
      ],
    }
    expect(terminalContinuousMatchLength(template, primer.bindings![0]!, true)).toBe(0)
    expect(hasDisplayablePrimerAnneal(template, primer.bindings![0]!)).toBe(false)
    expect(resolvePrimerFrameDisplays(makeRecord(template, [primer]))).toEqual([])
  })

  it('does not persist a 3-prime mismatch site when refreshing bindings', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `NNNN${annealed.slice(0, -1)}A${'N'.repeat(20)}`
    const primer: Primer = {
      id: 'term-mm-refresh',
      name: 'term',
      sequence: annealed,
      color: '#2563eb',
    }
    const refreshed = refreshExactPrimerBindings([primer], template)
    expect(refreshed[0]!.bindings ?? []).toEqual([])
  })

  it('does not display a primer whose 3-prime oligo end is an unmatched overhang', () => {
    const core = 'GACCACCATGTCAACGTTGG'
    const template = `NNNN${core}NNNN`
    const primer: Primer = {
      id: 'term-oh',
      name: 'term overhang',
      sequence: `${core}GGGGGGGG`,
      color: '#2563eb',
    }
    expect(resolvePrimerFrameDisplays(makeRecord(template, [primer]))).toEqual([])
    const stored: Primer = {
      ...primer,
      id: 'term-oh-stored',
      bindings: [
        {
          strand: 'forward',
          templateStart: 4,
          templateEnd: 24,
          components: [
            { primerBases: core, templateStart: 4, templateEnd: 24 },
            { primerBases: 'GGGGGGGG' },
          ],
        },
      ],
    }
    expect(hasDisplayablePrimerAnneal(template, stored.bindings![0]!)).toBe(false)
    expect(resolvePrimerFrameDisplays(makeRecord(template, [stored]))).toEqual([])
  })

  it('still displays when an isolated internal mismatch is allowed', () => {
    const templateCore = 'GACCACCATGTCAACGTTGG'
    const primerSeq = 'GACCACGATGTCAACGTTGG' // internal C→G
    const template = `NNNN${templateCore}NNNN`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 4,
      templateEnd: 24,
      components: [{ primerBases: primerSeq, templateStart: 4, templateEnd: 24 }],
    }
    expect(terminalContinuousMatchLength(template, layout, true)).toBe(primerSeq.length - 1)
    expect(hasDisplayablePrimerAnneal(template, layout)).toBe(true)
  })

  it('dedupes identical oligos inherited from multiple assembly parts', () => {
    const anneal = 'GACCACCATGTCAACGTTGG'
    const product = `NNNN${anneal}NNNN`
    const good: Primer = {
      id: 'good',
      name: 'SeqF',
      sequence: anneal,
      color: '#2563eb',
      bindings: [
        {
          strand: 'forward',
          templateStart: 4,
          templateEnd: 24,
          components: [{ primerBases: anneal, templateStart: 4, templateEnd: 24 }],
        },
      ],
    }
    const bad: Primer = {
      id: 'bad',
      name: 'SeqF',
      sequence: anneal,
      color: '#2563eb',
      bindings: [
        {
          strand: 'forward',
          templateStart: 4,
          templateEnd: 24,
          components: [
            { primerBases: anneal.slice(0, 10), templateStart: 4, templateEnd: 14 },
            { primerBases: 'X' },
            { primerBases: anneal.slice(11), templateStart: 15, templateEnd: 24 },
          ],
        },
      ],
    }
    const refreshed = refreshExactPrimerBindings([bad, good], product)
    expect(refreshed).toHaveLength(1)
    expect(refreshed[0]!.sequence).toBe(anneal)
    const displays = resolvePrimerFrameDisplays(makeRecord(product, refreshed))
    expect(displays).toHaveLength(1)
    expect(displays[0]!.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
  })

  it('still uses complex mutagenic bindings when the template has not been mutated', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const oligo = `${left}A${right}`
    const parental = `NNNN${left}C${right}NNNN`
    const mutagenicLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 4,
      templateEnd: 4 + left.length + 1 + right.length,
      components: [
        { primerBases: left, templateStart: 4, templateEnd: 4 + left.length },
        { primerBases: 'A' },
        {
          primerBases: right,
          templateStart: 4 + left.length + 1,
          templateEnd: 4 + left.length + 1 + right.length,
        },
      ],
    }
    const primer: Primer = {
      id: 'mut-parent',
      name: 'Mut fwd',
      sequence: oligo,
      color: '#2563eb',
      bindings: [mutagenicLayout],
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(parental, [primer]))
    expect(displays).toHaveLength(1)
    // Against the unmutated parent the oligo still shows the mutagenic change (insert and/or mismatch).
    expect(
      displays[0]?.glyphs.some(
        (glyph) => glyph.kind === 'insert' || glyph.kind === 'mismatch' || glyph.kind === 'template-gap',
      ),
    ).toBe(true)
    expect(displays[0]?.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(false)
  })

  it('keeps a long SnapGene complex duplex when soft anneal only finds a short 3-prime stub', () => {
    // Mirrors FAPco Xba dir: long annealed blocks interrupted by short inserts/gaps. Soft
    // Smith-Waterman often keeps only the 3′ stub (few counted defects, huge overhang);
    // defect-only comparison used to prefer that stub over the stored duplex.
    const fivePrimeOverhang = 'AGA'
    const blockA = 'GA'
    const insert1 = 'G'
    const blockB =
      'TCTAGAACCATGAAGACTTGGGTAAAAATCGTATTTGGAGTTGCCACCTCTGCTGTGCTTGCCTTATTGGTGATGTGCATTGTCTTAAGGCCC'
    const insert2 = 'AGC'
    const blockC = 'AG'
    const insert3 = 'G'
    const blockD = 'GTGCACAACAGCG'
    const oligo = fivePrimeOverhang + blockA + insert1 + blockB + insert2 + blockC + insert3 + blockD
    const gap1 = 'C'
    const gap2 = 'TCT'
    const gap3 = 'A'
    const core = blockA + gap1 + blockB + gap2 + blockC + gap3 + blockD
    const template = `NNNN${core}NNNN`
    const start = 4
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: start,
      templateEnd: start + core.length,
      components: [
        { primerBases: fivePrimeOverhang },
        { primerBases: blockA, templateStart: start, templateEnd: start + blockA.length },
        { primerBases: insert1 },
        {
          primerBases: blockB,
          templateStart: start + blockA.length + gap1.length,
          templateEnd: start + blockA.length + gap1.length + blockB.length,
        },
        { primerBases: insert2 },
        {
          primerBases: blockC,
          templateStart: start + blockA.length + gap1.length + blockB.length + gap2.length,
          templateEnd:
            start + blockA.length + gap1.length + blockB.length + gap2.length + blockC.length,
        },
        { primerBases: insert3 },
        {
          primerBases: blockD,
          templateStart:
            start + blockA.length + gap1.length + blockB.length + gap2.length + blockC.length + gap3.length,
          templateEnd: start + core.length,
        },
      ],
    }
    const primer: Primer = {
      id: 'fapco-like',
      name: 'FAPco-like Xba dir',
      sequence: oligo,
      color: '#7c3aed',
      bindings: [layout],
    }

    const displays = resolvePrimerFrameDisplays(makeRecord(template, [primer]))
    expect(displays).toHaveLength(1)
    const annealed = displays[0]!.glyphs.filter((glyph) => glyph.kind === 'annealed').length
    const overhang = displays[0]!.glyphs.filter((glyph) => glyph.kind === 'overhang').length
    // Soft stub anneals ~15 bp; the stored duplex anneals blockA+B+C+D (~110 bp).
    expect(annealed).toBeGreaterThanOrEqual(blockA.length + blockB.length + blockC.length + blockD.length - 2)
    expect(annealed).toBeGreaterThan(overhang)
  })

  it('shows a pasted duplicate binding region while keeping stored complex geometry at the original site', () => {
    const fivePrimeOverhang = 'AGA'
    const blockA = 'GA'
    const insert1 = 'G'
    const blockB =
      'TCTAGAACCATGAAGACTTGGGTAAAAATCGTATTTGGAGTTGCCACCTCTGCTGTGCTTGCCTTATTGGTGATGTGCATTGTCTTAAGGCCC'
    const insert2 = 'AGC'
    const blockC = 'AG'
    const insert3 = 'G'
    const blockD = 'GTGCACAACAGCG'
    const oligo = fivePrimeOverhang + blockA + insert1 + blockB + insert2 + blockC + insert3 + blockD
    const gap1 = 'C'
    const gap2 = 'TCT'
    const gap3 = 'A'
    const core = blockA + gap1 + blockB + gap2 + blockC + gap3 + blockD
    const start = 4
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: start,
      templateEnd: start + core.length,
      components: [
        { primerBases: fivePrimeOverhang },
        { primerBases: blockA, templateStart: start, templateEnd: start + blockA.length },
        { primerBases: insert1 },
        {
          primerBases: blockB,
          templateStart: start + blockA.length + gap1.length,
          templateEnd: start + blockA.length + gap1.length + blockB.length,
        },
        { primerBases: insert2 },
        {
          primerBases: blockC,
          templateStart: start + blockA.length + gap1.length + blockB.length + gap2.length,
          templateEnd:
            start + blockA.length + gap1.length + blockB.length + gap2.length + blockC.length,
        },
        { primerBases: insert3 },
        {
          primerBases: blockD,
          templateStart:
            start + blockA.length + gap1.length + blockB.length + gap2.length + blockC.length + gap3.length,
          templateEnd: start + core.length,
        },
      ],
    }
    const primer: Primer = {
      id: 'fapco-like-dup',
      name: 'FAPco-like Xba dir',
      sequence: oligo,
      color: '#7c3aed',
      bindings: [layout],
    }
    const template = `NNNN${core}${'C'.repeat(100)}${core}NNNN`
    const duplicateStart = template.indexOf(core, start + core.length)
    const displays = resolvePrimerFrameDisplays(makeRecord(template, [primer]))
    expect(displays).toHaveLength(2)
    expect(displays.map((display) => display.templateSpanStart).toSorted((a, b) => a - b)).toEqual([
      start,
      duplicateStart,
    ])
    const original = displays.find((display) => display.templateSpanStart === start)!
    const annealed = original.glyphs.filter((glyph) => glyph.kind === 'annealed').length
    expect(annealed).toBeGreaterThanOrEqual(blockA.length + blockB.length + blockC.length + blockD.length - 2)
  })

  it('places SnapGene reverse primer annealing on the correct template coordinates', () => {
    const template = 'A'.repeat(5161) + 'CTTCTCAAAAGTCTGCTAG' + 'A'.repeat(100)
    const layout = {
      strand: 'reverse' as const,
      templateStart: 5161,
      templateEnd: 5180,
      components: [
        { primerBases: 'AGAGAG' },
        { primerBases: 'CTAGCAGACTTTTGAGAAG', templateStart: 5161, templateEnd: 5180 },
      ],
    }
    const primer: Primer = {
      id: 'nhe',
      name: 'NHE NP primer rev',
      sequence: 'AGAGAGCTAGCAGACTTTTGAGAAG',
      color: '#7c3aed',
      bindings: [layout],
    }
    const display = buildPrimerFrameDisplay(primer, template, layout)
    const annealedGlyphs = display.glyphs.filter((glyph) => glyph.kind === 'annealed' || glyph.kind === 'mismatch')
    expect(annealedGlyphs.map((glyph) => glyph.templateIndex)).toEqual([
      5179, 5178, 5177, 5176, 5175, 5174, 5173, 5172, 5171, 5170, 5169, 5168, 5167, 5166, 5165, 5164, 5163, 5162, 5161,
    ])
    expect(annealedGlyphs.map((glyph) => glyph.char).join('')).toBe('CTAGCAGACTTTTGAGAAG')
    expect(annealedGlyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
    expect(display.templateSpanStart).toBe(5161)
    expect(display.templateSpanEnd).toBe(5180)
  })

  it('shows SnapGene reverse primer bases as bottom-strand sequence, not top-strand complement', () => {
    const template =
      'A'.repeat(4773) + 'CTTCCTGAAGCAGTGCTTCAGCCTGAGCGACTGAGGATCC' + 'A'.repeat(100)
    const layout = {
      strand: 'reverse' as const,
      templateStart: 4773,
      templateEnd: 4813,
      components: [
        { primerBases: 'agagag' },
        {
          primerBases: 'ggatccTCAGTCGCTCAGGCTGAAGCACTGCTTCAGGaag',
          templateStart: 4773,
          templateEnd: 4813,
        },
      ],
    }
    const primer: Primer = {
      id: 'bamhi',
      name: 'FAPco BamHI rev',
      sequence: 'agagagggatccTCAGTCGCTCAGGCTGAAGCACTGCTTCAGGaag',
      color: '#7c3aed',
      bindings: [layout],
    }
    const display = buildPrimerFrameDisplay(primer, template, layout)
    const annealedGlyphs = display.glyphs.filter((glyph) => glyph.kind === 'annealed')
    expect(annealedGlyphs.map((glyph) => glyph.char).join('')).toBe('ggatccTCAGTCGCTCAGGCTGAAGCACTGCTTCAGGaag')
    expect(
      [...annealedGlyphs].toSorted((a, b) => a.templateIndex! - b.templateIndex!).map((glyph) => glyph.char).join(''),
    ).toBe([...'ggatccTCAGTCGCTCAGGCTGAAGCACTGCTTCAGGaag'].reverse().join(''))
    expect(annealedGlyphs.map((glyph) => glyph.char).join('')).not.toBe('CTTCCTGAAGCAGTGCTTCAGCCTGAGCGACTGAGGATCC')
  })

  it('paints FAPco BamHI stop as a one-story insert with BamHI and half-raised overhang', () => {
    // SnapGene stores GAGCGAC|TGAG|GATCC (len-mismatched BamHI). Refine to GAGCGA|CTGA|GGATCC
    // so the oligo reads 3′→5′ as …GACT CCTAGG GAGAGA with a one-base template notch.
    const gene = 'cttcctgaagcagtgcttcagcct'
    const template = `${'N'.repeat(4773)}${(gene + 'gagcgacggatcc').toUpperCase()}${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 4773,
      templateEnd: 4810,
      components: [
        { primerBases: gene, templateStart: 4773, templateEnd: 4797 },
        { primerBases: 'gagcgac', templateStart: 4797, templateEnd: 4804 },
        { primerBases: 'tgag' },
        { primerBases: 'gatcc', templateStart: 4804, templateEnd: 4810 },
        { primerBases: 'ctctct' },
      ],
    }
    const sequence = 'agagagggatcctcagtcgctcaggctgaagcactgcttcaggaag'
    const display = buildPrimerFrameDisplay(
      { id: 'bamhi-rev', name: 'FAPco BamHI rev', sequence, color: '#7c3aed', bindings: [layout] },
      template,
      layout,
    )

    const joined = display.glyphs.filter((glyph) => glyph.char).map((glyph) => glyph.char).join('')
    expect(joined).toBe([...sequence].reverse().join('').toUpperCase())

    const insert = display.glyphs.filter((glyph) => glyph.kind === 'overhang' && glyph.row === PRIMER_ROW_INSERT_SHIFT)
    expect(insert.map((glyph) => glyph.char).join('')).toBe('GACT')

    const overhang = display.glyphs.filter((glyph) => glyph.kind === 'overhang' && glyph.row === PRIMER_ROW_HALF_SHIFT)
    expect(overhang.map((glyph) => glyph.char).join('')).toBe('GAGAGA')

    expect(display.glyphs.some((glyph) => glyph.kind === 'template-gap')).toBe(true)
    const bamhi = display.glyphs.filter(
      (glyph) => glyph.kind === 'annealed' && glyph.templateIndex !== undefined && glyph.templateIndex >= 4804,
    )
    expect(bamhi.map((glyph) => glyph.char).join('')).toBe('CCTAGG')
  })

  it('shows reverse primer glyphs in 3-prime-to-5-prime sequence-view orientation', () => {
    const sequence = 'AAAATGACCATGATTACGCCAAGAAA'
    const primer: Primer = {
      id: 'p-r',
      name: 'Reverse',
      sequence: 'GTAATCATGGTCAT',
      color: '#db2777',
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(sequence, [primer]))
    const reverse = displays.find((display) => display.strand === 'reverse')
    expect(reverse).toBeDefined()
    expect(reverse!.glyphs.map((glyph) => glyph.char).join('')).toBe(
      [...primer.sequence].reverse().join(''),
    )
    expect(reverse!.glyphs.every((glyph) => glyph.kind === 'annealed')).toBe(true)
  })

  it('falls back to a 3-prime annealed suffix when a primer has a 5-prime overhang', () => {
    const sequence = 'NNNNGACCACCATGTCNNNNGACCACCATGTCNNNN'
    const primer: Primer = {
      id: 'p2-overhang',
      name: 'overhang fwd',
      sequence: 'GGGGGACCACCATGTC',
      color: '#7c3aed',
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(sequence, [primer]))
    expect(displays).toHaveLength(2)
    expect(displays.every((display) => display.strand === 'forward')).toBe(true)
    expect(displays.map((display) => display.templateSpanStart).toSorted((a, b) => a - b)).toEqual([4, 20])
  })

  it('derives map and sequence primer bindings from the same displayable sites', () => {
    const sequence = 'NNNNGACCACCATGTCNNNNGACCACCATGTCNNNN'
    const primer: Primer = {
      id: 'p-shared',
      name: 'shared fwd',
      sequence: 'GACCACCATGTC',
      color: '#7c3aed',
    }
    const { displays, bindings } = resolveDisplayablePrimerSites(makeRecord(sequence, [primer]))
    expect(displays).toHaveLength(2)
    expect(bindings).toHaveLength(2)
    expect(bindings.map((binding) => binding.start).toSorted((a, b) => a - b)).toEqual([4, 20])
  })

  it('ignores a single stored binding and still displays every repeat site', () => {
    const sequence = 'NNNNGACCACCATGTCNNNNGACCACCATGTCNNNN'
    const primer: Primer = {
      id: 'p-locked',
      name: 'locked fwd',
      sequence: 'GACCACCATGTC',
      color: '#7c3aed',
      bindings: [
        {
          strand: 'forward',
          templateStart: 4,
          templateEnd: 16,
          components: [{ primerBases: 'GACCACCATGTC', templateStart: 4, templateEnd: 16 }],
        },
      ],
    }
    const displays = resolvePrimerFrameDisplays(makeRecord(sequence, [primer]))
    expect(displays).toHaveLength(2)
    expect(displays.map((display) => display.templateSpanStart).toSorted((a, b) => a - b)).toEqual([4, 20])
  })

  it('computes forward primer clearance spans for intersecting enzyme labels', () => {
    const displays = resolvePrimerFrameDisplays(
      makeRecord(`${'A'.repeat(10)}GACCACCATGTC${'A'.repeat(78)}`, [
        {
          id: 'p3',
          name: 'fwd',
          sequence: 'GACCACCATGTC',
          color: '#7c3aed',
          bindings: [
            {
              strand: 'forward',
              templateStart: 10,
              templateEnd: 22,
              components: [{ primerBases: 'GACCACCATGTC', templateStart: 10, templateEnd: 22 }],
            },
          ],
        },
      ]),
    )
    const spans = primerClearanceSpansForRow(displays, 0, 60, 28, 10)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.left).toBeLessThanOrEqual(28 + 10 * 10)
    expect(spans[0]!.right).toBeGreaterThanOrEqual(28 + 22 * 10)
  })

  it('does not display primers whose 3-prime annealed stretch is below 35 C', () => {
    const displays = resolvePrimerFrameDisplays(
      makeRecord('NNNATGCNNN', [
        {
          id: 'p-low-tm',
          name: 'low tm',
          sequence: 'ATGC',
          color: '#7c3aed',
          bindings: [
            {
              strand: 'forward',
              templateStart: 3,
              templateEnd: 7,
              components: [{ primerBases: 'ATGC', templateStart: 3, templateEnd: 7 }],
            },
          ],
        },
      ]),
    )
    expect(displays).toEqual([])
  })

  it('produces arrow frame bounds with room for overhang bases', () => {
    const template = 'A'.repeat(30)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 15,
      components: [{ primerBases: 'GAACA' }, { primerBases: 'AAAAA', templateStart: 10, templateEnd: 15 }],
    }
    const primer: Primer = { id: 'p4', name: 'hairpin', sequence: 'GAACAAAAA', color: '#7c3aed', bindings: [layout] }
    const display = buildPrimerFrameDisplay(primer, template, layout)
    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward')
    expect(bounds).not.toBeNull()
    expect(bounds!.left).toBeLessThan(28 + 10 * 10)
    expect(bounds!.right).toBeGreaterThan(28 + 14 * 10)
    expect(bounds!.bottom - bounds!.top).toBeCloseTo(metrics.frameHeight, 1)
  })

  it('uses three display rows for frame metrics', () => {
    expect(metrics.frameHeight).toBeGreaterThan(metrics.rowHeight * PRIMER_DISPLAY_ROWS)
    expect(metrics.halfShift).toBe(metrics.rowHeight * PRIMER_ROW_HALF_SHIFT)
    expect(metrics.displayRows).toBe(PRIMER_DISPLAY_ROWS)
  })

  it('compacts stack height for plain duplex primers and keeps room for hairpins', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    const plainLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [{ primerBases: 'AAAACCCC', templateStart: 10, templateEnd: 18 }],
    }
    const plain = buildPrimerFrameDisplay(
      { id: 'plain', name: 'plain', sequence: 'AAAACCCC', color: '#000', bindings: [plainLayout] },
      template,
      plainLayout,
    )
    const plainMetrics = primerFrameMetricsForDisplay(plain, 12, 1.8)
    expect(plainMetrics.displayRows).toBe(1)
    expect(primerLaneStackHeight(plainMetrics)).toBeLessThan(primerLaneStackHeight(metrics))

    const hairpinLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [
        { primerBases: 'AAAA', templateStart: 10, templateEnd: 14 },
        { primerBases: 'TTTTTT' },
        { primerBases: 'CCCC', templateStart: 14, templateEnd: 18 },
      ],
    }
    const hairpin = buildPrimerFrameDisplay(
      { id: 'hairpin', name: 'hairpin', sequence: 'AAAATTTTTTCCCC', color: '#000', bindings: [hairpinLayout] },
      template,
      hairpinLayout,
    )
    const hairpinMetrics = primerFrameMetricsForDisplay(hairpin, 12, 1.8)
    expect(hairpinMetrics.displayRows).toBe(PRIMER_ROW_INSERT_SHIFT)
    expect(primerLaneStackHeight(hairpinMetrics)).toBe(primerLaneStackHeight(plainMetrics))
  })

  it('reserves reverse arrow overhang so flaps clear lower labels and the row divider', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    const plainLayout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 18,
      components: [{ primerBases: 'GGGGTTTT', templateStart: 10, templateEnd: 18 }],
    }
    const plain = buildPrimerFrameDisplay(
      { id: 'rev', name: 'rev', sequence: 'GGGGTTTT', color: '#000', bindings: [plainLayout] },
      template,
      plainLayout,
    )
    const compact = primerFrameMetricsForDisplay(plain, 12, 1.8)
    expect(compact.displayRows).toBe(1)

    const withoutArrow = primerLaneStackHeight(compact)
    const withArrow = primerLaneStackHeight(compact, { reverseArrow: true })
    const flapHeight = primerArrowFlapHeightPx(compact)

    expect(flapHeight).toBe(compact.rowHeight)
    expect(primerReverseArrowStackPad(compact)).toBe(withArrow - withoutArrow)
    expect(withArrow).toBeGreaterThan(withoutArrow)

    // Flap hangs below the annealed band; the lane must reach the tip plus a label gap.
    const annealedCenterY = glyphY({ char: '', kind: 'annealed', row: 0 }, compact, 'reverse', compact.rowHeight)
    const halfHeight = compact.rowHeight * 0.5
    const flap = primerArrowFlapPoints(0, annealedCenterY + halfHeight, 1, 1, 10, flapHeight)
    const flapBottom = Math.max(flap.p0y, flap.p1y, flap.p2y, flap.p3y)
    expect(flapBottom).toBeGreaterThan(compact.rowHeight + compact.frameHeight)
    expect(withArrow).toBeGreaterThanOrEqual(flapBottom + compact.labelGap)

    const reverseBounds = primerFrameBounds(plain, 10, 8, 0, 10, compact, 'reverse')
    expect(reverseBounds?.top).toBe(0)
    expect(primerLaneStackHeight(compact, { reverseArrow: true, reverseLabelBelow: true })).toBe(
      primerLaneStackHeight(compact),
    )

    // Compact reverse frames still reserve the terminal flap below the body.
    const hairpinLayout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 18,
      components: [
        { primerBases: 'GGGG', templateStart: 14, templateEnd: 18 },
        { primerBases: 'AAAAAA' },
        { primerBases: 'TTTT', templateStart: 10, templateEnd: 14 },
      ],
    }
    const hairpin = buildPrimerFrameDisplay(
      { id: 'rev-hp', name: 'rev-hp', sequence: 'GGGGAAAAAATTTT', color: '#000', bindings: [hairpinLayout] },
      template,
      hairpinLayout,
    )
    const tall = primerFrameMetricsForDisplay(hairpin, 12, 1.8)
    expect(tall.displayRows).toBe(1)
    expect(primerReverseArrowStackPad(tall)).toBeGreaterThan(0)
    expect(primerLaneStackHeight(tall, { reverseArrow: true })).toBeGreaterThan(primerLaneStackHeight(tall))
  })

  it('builds a LetterSnake frame with integrated arrow for hairpin primers', () => {
    const template = 'A'.repeat(30)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 15,
      components: [{ primerBases: 'GAACA' }, { primerBases: 'AAAAA', templateStart: 10, templateEnd: 15 }],
    }
    const primer: Primer = { id: 'p5', name: 'hairpin paths', sequence: 'GAACAAAAA', color: '#7c3aed', bindings: [layout] }
    const display = buildPrimerFrameDisplay(primer, template, layout)
    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward')
    expect(bounds).not.toBeNull()

    const layers = primerFramePaths(display, 0, 60, 28, 10, metrics, bounds!, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })

    expect(layers.fills.length).toBeGreaterThan(0)
    expect(layers.fills.some((path) => path.endsWith('Z'))).toBe(true)
    // Arrow seats on the padded terminal edge (letter cell right 178 + 1/4 letter).
    expect(layers.fills.some((path) => path.includes('L 165.5 45.2'))).toBe(true)
    expect(hairpinLoopPath(display, bounds!, 0, 28, 10, metrics, 60)).toBeNull()
  })

  it('opens the body outline where the integrated arrow attaches so no separator remains', () => {
    const template = `${'N'.repeat(10)}${'A'.repeat(12)}${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 22,
      components: [{ primerBases: 'A'.repeat(12), templateStart: 10, templateEnd: 22 }],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'arrow-mouth', name: 'X', sequence: 'A'.repeat(12), color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward', {
      showArrow: true,
      labelFontSizePx: 11,
    })!

    const firstPoint = (path: string) => {
      const match = path.match(/M\s+(-?[\d.]+)\s+(-?[\d.]+)/)!
      return [Number(match[1]), Number(match[2])] as const
    }
    const lastPoint = (path: string) => {
      const pairs = [...path.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)]
      const end = pairs[pairs.length - 1]!
      return [Number(end[1]), Number(end[2])] as const
    }

    const withArrow = primerFramePaths(display, 0, 60, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    // Body fill stays closed (it masks intersecting leaders); the body outline is opened.
    const bodyFill = withArrow.fills.reduce((a, b) => (b.length > a.length ? b : a))
    expect(bodyFill.trimEnd().endsWith('Z')).toBe(true)
    const bodyOutline = withArrow.outlines.reduce((a, b) => (b.length > a.length ? b : a))
    expect(bodyOutline.trimEnd().endsWith('Z')).toBe(false)
    // The flap (only straight segments, no rounded Q) meets the body mouth at both ends.
    const flap = withArrow.outlines.find((path) => path !== bodyOutline && !path.includes('Q'))!
    expect(firstPoint(bodyOutline)).toEqual(firstPoint(flap))
    expect(lastPoint(bodyOutline)).toEqual(lastPoint(flap))

    // Without the arrow the body outline is a normal closed (rounded) frame.
    const withoutArrow = primerFramePaths(display, 0, 60, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: false,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    expect(withoutArrow.outlines.every((path) => path.trimEnd().endsWith('Z'))).toBe(true)
  })

  it('uses LetterSnake closed fills instead of a separate annealed-band mask', () => {
    const template = 'A'.repeat(20) + 'GACCACCATGTA' + 'N'.repeat(12) + 'TAGASAGKNNNN' + 'T'.repeat(20)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 20,
      templateEnd: 56,
      components: [
        { primerBases: 'GAACA' },
        { primerBases: 'GACCACCATGTC', templateStart: 20, templateEnd: 32 },
        { primerBases: 'TAGASAGKNNNN', templateStart: 44, templateEnd: 56 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-mask', name: 'multi', sequence: 'x', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const bounds = primerFrameBounds(display, 0, 80, 28, 10, metrics, 'forward')!
    const layers = primerFramePaths(display, 0, 80, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    expect(primerFramePathsNeedBackgroundFill(layers)).toBe(false)
    expect(layers.fills.some((path) => path.endsWith('Z'))).toBe(true)
    const fill = primerFrameBackgroundFillPath(bounds, metrics, 'forward')
    // Slightly rounded rect: bottom-left corner is a Q control at (left, bottom).
    expect(fill).toContain(`Q ${bounds.left} 88.39999999999999`)
    expect(fill).toContain(`Q ${bounds.right} 66.8`)
    expect(fill).not.toContain(`L ${bounds.right} ${bounds.top}`)
    expect(
      primerFrameBackgroundFillPath(bounds, metrics, 'forward', {
        left: bounds.left - 20,
        right: bounds.right + 20,
      }),
    ).toContain(`Q ${bounds.left - 20} 88.39999999999999`)
    expect(fill).toContain('Z')

    const plainLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 15,
      components: [{ primerBases: 'AAAAA', templateStart: 10, templateEnd: 15 }],
    }
    const plainDisplay = buildPrimerFrameDisplay(
      { id: 'p-plain', name: 'plain', sequence: 'AAAAA', color: '#000', bindings: [plainLayout] },
      'A'.repeat(30),
      plainLayout,
    )
    const plainBounds = primerFrameBounds(plainDisplay, 0, 60, 28, 10, metrics, 'forward')!
    const plainLayers = primerFramePaths(plainDisplay, 0, 60, 28, 10, metrics, plainBounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    expect(primerFramePathsNeedBackgroundFill(plainLayers)).toBe(false)
  })

  it('raises an overlong internal insert with a LetterSnake portal stem over a template gap', () => {
    const template = `${'N'.repeat(10)}AAAA${'N'.repeat(2)}CCCC${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 20,
      components: [
        { primerBases: 'AAAA', templateStart: 10, templateEnd: 14 },
        { primerBases: 'TTTTTT' },
        { primerBases: 'CCCC', templateStart: 16, templateEnd: 20 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-tall-insert', name: 'tall insert', sequence: 'AAAATTTTTTCCCC', color: '#000', bindings: [layout] },
      template,
      layout,
    )

    expect(display.glyphs.filter((glyph) => glyph.kind === 'overhang').every((glyph) => glyph.row === PRIMER_ROW_INSERT_SHIFT)).toBe(true)
    expect(display.glyphs.filter((glyph) => glyph.kind === 'template-gap').every((glyph) => glyph.row === PRIMER_ROW_HALF_SHIFT)).toBe(true)

    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward')!
    expect(display.glyphs.filter((glyph) => glyph.kind === 'overhang')).toHaveLength(6)

    const layers = primerFramePaths(display, 0, 60, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    const joined = joinFrameLayers(layers)

    expect(layers.fills[0]).toContain('Z')
    // Raised insert band is padded 1/4 letter past the flanking letter-cell edges.
    // Corners are quadratic-rounded, so original vertices remain as Q controls.
    expect(joined).toMatch(/\bQ\b/)
    expect(joined).toContain('165.5 45.2')
    expect(joined).toContain('190.5 45.2')
    expect(joined).toContain('145.5 46.6')
    expect(joined).toContain('210.5 46.6')
    expect(layers.fills.every((path) => path.endsWith('Z'))).toBe(true)
    expect(layers.outlines.some((path) => path.includes('230.5 88.4'))).toBe(true)
  })

  it('connects an adjacent-block oversize insert through a LetterSnake portal stem', () => {
    // Two annealed blocks adjacent on the template, one extra primer base between them.
    const template = `${'A'.repeat(20)}CTCTAGATGCAGGTGGT${'A'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 20,
      templateEnd: 37,
      components: [
        { primerBases: 'CTCTAG', templateStart: 20, templateEnd: 26 },
        { primerBases: 'A' },
        { primerBases: 'ATGCAGGTGGT', templateStart: 26, templateEnd: 37 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-single-insert', name: 'single insert', sequence: 'CTCTAGAATGCAGGTGGT', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const insertGlyph = display.glyphs.find((glyph) => glyph.kind === 'overhang')!
    expect(insertGlyph.row).toBe(PRIMER_ROW_INSERT_SHIFT)

    const bounds = primerFrameBounds(display, 0, 80, 28, 10, metrics, 'forward')!
    const layers = primerFramePaths(display, 0, 80, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    const joined = joinFrameLayers(layers)

    expect(layers.fills[0]).toContain('Z')
    expect(joined).toMatch(/\bQ\b/)
    expect(joined).toContain('Q 280.5 45.2')
    expect(joined).toContain('Q 295.5 45.2')
    expect(joined).toContain('296.9 66.8')
    expect(layers.outlines.length).toBeGreaterThan(layers.fills.length)
  })

  it('keeps a shorter primer insert at half-shift across a wider template gap', () => {
    const template = `${'N'.repeat(10)}AAAA${'N'.repeat(3)}CCCC${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 21,
      components: [
        { primerBases: 'AAAA', templateStart: 10, templateEnd: 14 },
        { primerBases: 'T' },
        { primerBases: 'CCCC', templateStart: 17, templateEnd: 21 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-gap-insert', name: 'gap insert', sequence: 'AAAATCCCC', color: '#000', bindings: [layout] },
      template,
      layout,
    )

    const insertGlyph = display.glyphs.find((glyph) => glyph.kind === 'overhang')!
    expect(insertGlyph.row).toBe(PRIMER_ROW_HALF_SHIFT)
    expect(display.glyphs.filter((glyph) => glyph.kind === 'template-gap').every((glyph) => glyph.row === PRIMER_ROW_HALF_SHIFT)).toBe(true)

    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward')!
    const layers = primerFramePaths(display, 0, 60, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })

    expect(layers.fills[0]).toContain('Z')
    const joinedOutlines = layers.outlines.join(' ')
    expect(joinedOutlines).toMatch(/\bQ\b/)
    // Vertical stem at the raised insert stays on x=200.5 between the two rows.
    expect(joinedOutlines).toContain('Q 200.5 56')
    expect(joinedOutlines).toContain('Q 200.5 66.8')
    expect(joinedOutlines).toContain('Q 195.5 88.4')
    expect(joinedOutlines).toContain('Q 195.5 77.6')
    expect(joinedOutlines).not.toContain('L 200.5 66.8 L 200.5 77.6')

    const insertIndex = display.glyphs.findIndex((glyph) => glyph.kind === 'overhang')
    const insertX = primerGlyphX(display, display.glyphs[insertIndex]!, insertIndex, 0, 28, 10, bounds)
    const gapMidX = (templateX(14, 0, 28, 10) + templateX(16, 0, 28, 10)) / 2
    expect(insertX).toBeCloseTo(gapMidX, 5)
    expect(Math.abs(insertX - templateX(17, 0, 28, 10))).toBeGreaterThan(5)
  })

  it('keeps mismatches at half-shift inside an annealed duplex', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [{ primerBases: 'AAAGCCCC', templateStart: 10, templateEnd: 18 }],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-mismatch-row', name: 'mismatch row', sequence: 'AAAGCCCC', color: '#000', bindings: [layout] },
      template,
      layout,
    )

    expect(display.glyphs[3]).toMatchObject({ kind: 'mismatch', row: PRIMER_ROW_HALF_SHIFT })
    expect(display.glyphs.filter((glyph) => glyph.kind === 'annealed').every((glyph) => glyph.row === 0)).toBe(true)

    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward')!
    const layers = primerFramePaths(display, 0, 60, 28, 10, metrics, bounds, {
      strand: 'forward',
      integrateArrow: false,
      integrateHairpin: true,
      baseStepPx: 10,
    })
    expect(layers.fills).toHaveLength(1)
    expect(layers.fills[0]).toContain('Z')
    const joinedOutlines = layers.outlines.join(' ')
    // Raised mismatch cell is [158,168]; vertical borders sit 1/4 letter outside.
    // Corners are quadratic-rounded (original vertices remain as Q controls).
    expect(joinedOutlines).toContain('Q 170.5 56')
    expect(joinedOutlines).toContain('Q 170.5 66.8')
    expect(joinedOutlines).toMatch(/Q 155\.5 56/)
    expect(joinedOutlines).toContain('155.5 66.8')
    expect(joinedOutlines).not.toContain('L 170.5 66.8 L 170.5 77.6')
  })

  it('keeps reverse oligo mismatches a half line below the annealed body', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    // SnapGene reverse: oligo 5′→3′ pairs with the bottom strand (rc of AAAACCCC is GGGGTTTT).
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 18,
      components: [{ primerBases: 'GGGGCTTT', templateStart: 10, templateEnd: 18 }],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-rev-mismatch', name: 'rev mismatch', sequence: 'GGGGCTTT', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const mismatch = display.glyphs.find((glyph) => glyph.kind === 'mismatch')
    expect(mismatch).toMatchObject({ kind: 'mismatch', row: PRIMER_ROW_HALF_SHIFT, char: 'C' })

    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'reverse')!
    const annealedY = glyphY({ char: '', kind: 'annealed', row: 0 }, metrics, 'reverse', bounds.top)
    const mismatchY = glyphY(mismatch!, metrics, 'reverse', bounds.top)
    expect(mismatchY - annealedY).toBeCloseTo(metrics.rowHeight * PRIMER_ROW_HALF_SHIFT, 5)
  })

  it('keeps reverse 5′→3′ internal inserts at half-shift when they fit the template gap', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    // Descending template order matches SnapGene reverse oligo component listing.
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 18,
      components: [
        { primerBases: 'GGGG', templateStart: 14, templateEnd: 18 },
        { primerBases: 'A' },
        { primerBases: 'TTT', templateStart: 10, templateEnd: 13 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-rev-insert', name: 'rev insert', sequence: 'GGGGATTT', color: '#000', bindings: [layout] },
      template,
      layout,
    )

    expect(display.glyphs.some((glyph) => glyph.kind === 'template-gap' && glyph.templateIndex === 13)).toBe(true)
    expect(display.glyphs.filter((glyph) => glyph.kind === 'overhang')).toEqual([
      expect.objectContaining({ char: 'A', row: PRIMER_ROW_HALF_SHIFT }),
    ])
    expect(display.glyphs.every((glyph) => glyph.row <= PRIMER_ROW_HALF_SHIFT)).toBe(true)
  })

  it('lifts an oversize insert an extra half row when a flanking base is a mismatch', () => {
    // prev annealed ends in a mismatch (G vs template A); insert is oversize; next annealed matches.
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [
        { primerBases: 'AAAG', templateStart: 10, templateEnd: 14 },
        { primerBases: 'TTTTTT' },
        { primerBases: 'CCCC', templateStart: 14, templateEnd: 18 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-tall-insert-mismatch', name: 'mismatch insert', sequence: 'AAAGTTTTTTCCCC', color: '#000', bindings: [layout] },
      template,
      layout,
    )

    // The mismatch glyph sits half a row up; the oversize insert lifts to 1.75 rows.
    expect(display.glyphs[3]).toMatchObject({ kind: 'mismatch', row: PRIMER_ROW_HALF_SHIFT })
    expect(display.glyphs.slice(4, 10).every((glyph) => glyph.row === PRIMER_ROW_INSERT_SHIFT + PRIMER_ROW_HALF_SHIFT)).toBe(true)
  })

  it('lifts an oversize insert when a nearby mismatch falls under the cap footprint', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [
        { primerBases: 'AGAA', templateStart: 10, templateEnd: 14 },
        { primerBases: 'TTTTTT' },
        { primerBases: 'CCCC', templateStart: 14, templateEnd: 18 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-tall-insert-near-mismatch', name: 'near mismatch insert', sequence: 'AGAATTTTTTCCCC', color: '#000', bindings: [layout] },
      template,
      layout,
    )

    expect(display.glyphs[1]).toMatchObject({ kind: 'mismatch', row: PRIMER_ROW_HALF_SHIFT })
    expect(display.glyphs.slice(4, 10).every((glyph) => glyph.row === PRIMER_ROW_INSERT_SHIFT + PRIMER_ROW_HALF_SHIFT)).toBe(true)
  })

  it('integrates complex primer segments into one LetterSnake frame', () => {
    const template = 'A'.repeat(20) + 'GACCACCATGTA' + 'N'.repeat(12) + 'TAGASAGKNNNN' + 'T'.repeat(20)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 20,
      templateEnd: 56,
      components: [
        { primerBases: 'GAACA' },
        { primerBases: 'GACCACCATGTC', templateStart: 20, templateEnd: 32 },
        { primerBases: 'TAGASAGKNNNN', templateStart: 44, templateEnd: 56 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-multi', name: 'multi', sequence: 'x', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const bounds = primerFrameBounds(display, 0, 80, 28, 10, metrics, 'forward')!
    const layers = primerFramePaths(display, 0, 80, 28, 10, metrics, bounds!, {
      strand: 'forward',
      integrateArrow: true,
      integrateHairpin: true,
      baseStepPx: 10,
    })

    expect(layers.fills.length).toBeGreaterThan(0)
    expect(layers.fills.some((path) => path.endsWith('Z'))).toBe(true)
    expect(joinFrameLayers(layers)).toContain('L 340.5 56')
  })

  it('aligns overhang letters on the sequence grid', () => {
    const template = 'A'.repeat(30)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 15,
      components: [{ primerBases: 'GAACA' }, { primerBases: 'AAAAA', templateStart: 10, templateEnd: 15 }],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'p-align', name: 'align', sequence: 'GAACAAAAA', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const bounds = primerFrameBounds(display, 0, 60, 28, 10, metrics, 'forward')!
    const firstAnnealedX = primerGlyphX(display, display.glyphs[5]!, 5, 0, 28, 10, bounds)
    const lastOverhangX = primerGlyphX(display, display.glyphs[4]!, 4, 0, 28, 10, bounds)
    expect(lastOverhangX + 10).toBe(firstAnnealedX)
    expect(primerGlyphX(display, display.glyphs[0]!, 0, 0, 28, 10, bounds)).toBe(firstAnnealedX - 50)
  })

  it('extends SnapGene reverse 5′ overhangs away from the annealed body, not folded back', () => {
    const template = 'A'.repeat(40) + 'CTTCTCAAAAGTCTGCTAG' + 'A'.repeat(20)
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 40,
      templateEnd: 59,
      components: [
        { primerBases: 'AGAGAG' },
        { primerBases: 'CTAGCAGACTTTTGAGAAG', templateStart: 40, templateEnd: 59 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      {
        id: 'nhe-oh',
        name: 'rev overhang',
        sequence: 'AGAGAGCTAGCAGACTTTTGAGAAG',
        color: '#7c3aed',
        bindings: [layout],
      },
      template,
      layout,
    )
    const bounds = primerFrameBounds(display, 0, 80, 28, 10, metrics, 'reverse')!
    const overhangXs = display.glyphs
      .map((glyph, index) => ({ glyph, index }))
      .filter(({ glyph }) => glyph.kind === 'overhang')
      .map(({ glyph, index }) => primerGlyphX(display, glyph, index, 0, 28, 10, bounds))
    const firstAnnealedX = primerGlyphX(display, display.glyphs[6]!, 6, 0, 28, 10, bounds)

    expect(overhangXs).toHaveLength(6)
    // 5′ tip is furthest right; junction base sits immediately right of the annealed 5′ end.
    expect(overhangXs[0]).toBe(firstAnnealedX + 60)
    expect(overhangXs[5]).toBe(firstAnnealedX + 10)
    for (let index = 0; index < overhangXs.length - 1; index += 1) {
      expect(overhangXs[index]!).toBeGreaterThan(overhangXs[index + 1]!)
    }
    expect(overhangXs[5]!).toBeGreaterThan(firstAnnealedX)
  })

  it('includes reverse 5′ overhangs in the painted span used for lane packing', () => {
    const template = 'A'.repeat(40) + 'CTTCTCAAAAGTCTGCTAG' + 'A'.repeat(20)
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 40,
      templateEnd: 59,
      components: [
        { primerBases: 'AGAGAG' },
        { primerBases: 'CTAGCAGACTTTTGAGAAG', templateStart: 40, templateEnd: 59 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      {
        id: 'nhe-oh',
        name: 'rev overhang',
        sequence: 'AGAGAGCTAGCAGACTTTTGAGAAG',
        color: '#7c3aed',
        bindings: [layout],
      },
      template,
      layout,
    )
    const span = primerVisualSpanForRow(display, 0, 80, 28, 10)!
    const annealedLeft = 28 + 40 * 10
    const annealedRight = 28 + 59 * 10
    expect(span.left).toBeGreaterThanOrEqual(annealedLeft - 10)
    expect(span.left).toBeLessThan(annealedLeft + 10)
    expect(span.right).toBeGreaterThan(annealedRight + 50)
  })

  it('does not inflate the painted span for internal insert overhangs', () => {
    const template = `${'N'.repeat(10)}AAAACCCC${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [
        { primerBases: 'AAAA', templateStart: 10, templateEnd: 14 },
        { primerBases: 'TTTTTT' },
        { primerBases: 'CCCC', templateStart: 14, templateEnd: 18 },
      ],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'hairpin', name: 'hairpin', sequence: 'AAAATTTTTTCCCC', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const span = primerVisualSpanForRow(display, 0, 60, 28, 10)!
    expect(span.left).toBeGreaterThanOrEqual(28 + 10 * 10 - 10)
    expect(span.right).toBeLessThanOrEqual(28 + 18 * 10 + 10)
  })

  it('detects reverse primers whose 5′ overhangs overlap a downstream primer', () => {
    const template = 'A'.repeat(80)
    const leftLayout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 20,
      components: [
        { primerBases: 'GGGGGGGG' },
        { primerBases: 'TTTTTTTTTT', templateStart: 10, templateEnd: 20 },
      ],
    }
    const rightLayout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 22,
      templateEnd: 32,
      components: [{ primerBases: 'TTTTTTTTTT', templateStart: 22, templateEnd: 32 }],
    }
    const left = buildPrimerFrameDisplay(
      { id: 'left', name: 'left', sequence: 'GGGGGGGGTTTTTTTTTT', color: '#000', bindings: [leftLayout] },
      template,
      leftLayout,
    )
    const right = buildPrimerFrameDisplay(
      { id: 'right', name: 'right', sequence: 'TTTTTTTTTT', color: '#000', bindings: [rightLayout] },
      template,
      rightLayout,
    )
    const leftSpan = primerVisualSpanForRow(left, 0, 80, 28, 10)!
    const rightSpan = primerVisualSpanForRow(right, 0, 80, 28, 10)!
    expect(leftSpan.right).toBeGreaterThan(rightSpan.left)
  })

  it('keeps primer names over annealed bases or lifts them above overhang', () => {
    const template = 'A'.repeat(30)
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 15,
      components: [{ primerBases: 'GAACA' }, { primerBases: 'AAAAA', templateStart: 10, templateEnd: 15 }],
    }
    const shortAnnealed: Primer = {
      id: 'p6',
      name: 'Short',
      sequence: 'GAACAAAAA',
      color: '#7c3aed',
      bindings: [layout],
    }
    const longName: Primer = {
      id: 'p7',
      name: 'Very long primer name',
      sequence: 'GAACAAAAA',
      color: '#7c3aed',
      bindings: [layout],
    }
    const plainLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 15,
      components: [{ primerBases: 'AAAAA', templateStart: 10, templateEnd: 15 }],
    }
    const shortBounds = primerFrameBounds(buildPrimerFrameDisplay(shortAnnealed, template, layout), 0, 60, 28, 10, metrics, 'forward')
    const longBounds = primerFrameBounds(buildPrimerFrameDisplay(longName, template, layout), 0, 60, 28, 10, metrics, 'forward')
    const plainBounds = primerFrameBounds(
      buildPrimerFrameDisplay({ id: 'p8', name: 'Plain', sequence: 'AAAAA', color: '#7c3aed', bindings: [plainLayout] }, template, plainLayout),
      0,
      60,
      28,
      10,
      metrics,
      'forward',
    )

    expect(shortBounds).not.toBeNull()
    expect(longBounds).not.toBeNull()
    expect(plainBounds).not.toBeNull()
    expect(shortBounds!.labelX).toBeGreaterThanOrEqual(128)
    expect(shortBounds!.labelX).toBeLessThanOrEqual(178)
    expect(longBounds!.labelY).toBeLessThan(plainBounds!.labelY)
  })

  it('keeps the name beside the annealed body when a mismatch can be dodged sideways', () => {
    const template = `${'N'.repeat(10)}${'A'.repeat(24)}${'N'.repeat(20)}`
    const plainBases = 'A'.repeat(24)
    const mismatchBases = `${'A'.repeat(11)}G${'A'.repeat(12)}`
    const plainLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 34,
      components: [{ primerBases: plainBases, templateStart: 10, templateEnd: 34 }],
    }
    const mismatchLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 34,
      components: [{ primerBases: mismatchBases, templateStart: 10, templateEnd: 34 }],
    }
    const plain = buildPrimerFrameDisplay(
      { id: 'plain', name: 'Fwd1', sequence: plainBases, color: '#000', bindings: [plainLayout] },
      template,
      plainLayout,
    )
    const mismatched = buildPrimerFrameDisplay(
      { id: 'mm', name: 'Fwd1', sequence: mismatchBases, color: '#000', bindings: [mismatchLayout] },
      template,
      mismatchLayout,
    )
    const plainMetrics = primerFrameMetricsForDisplay(plain, 12, 1.8)
    const mismatchMetrics = primerFrameMetricsForDisplay(mismatched, 12, 1.8)
    const plainBounds = primerFrameBounds(plain, 0, 80, 28, 10, plainMetrics, 'forward', {
      showArrow: false,
      labelFontSizePx: 11,
    })!
    const mismatchBounds = primerFrameBounds(mismatched, 0, 80, 28, 10, mismatchMetrics, 'forward', {
      showArrow: false,
      labelFontSizePx: 11,
    })!

    const preferredMismatchY =
      glyphY({ char: '', kind: 'annealed', row: 0 }, mismatchMetrics, 'forward', mismatchBounds.top) -
      mismatchMetrics.rowHeight * 0.5 -
      mismatchMetrics.labelGap -
      primerLabelMetrics('Fwd1', 11).halfHeight

    expect(mismatchBounds.labelY).toBeCloseTo(preferredMismatchY, 5)
    expect(Math.abs(mismatchBounds.labelX - plainBounds.labelX)).toBeGreaterThan(5)

    // The dodge must clear the raised mismatch's padded frame border, not just its
    // letter cell. The mismatch sits at template index 21 (start 10 + offset 11).
    const mismatchX = templateX(21, 0, 28, 10)
    const framePad = 10 * PRIMER_FRAME_EDGE_PAD_RATIO
    const paddedHalfSpan = 10 * 0.5 + framePad
    const labelHalfWidth = primerLabelMetrics('Fwd1', 11).halfWidth
    const clearsLeft = mismatchBounds.labelX + labelHalfWidth <= mismatchX - paddedHalfSpan + 0.001
    const clearsRight = mismatchBounds.labelX - labelHalfWidth >= mismatchX + paddedHalfSpan - 0.001
    expect(clearsLeft || clearsRight).toBe(true)
  })

  it('places a reverse primer name below the annealed body', () => {
    const template = `${'N'.repeat(10)}${'A'.repeat(20)}${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 30,
      components: [{ primerBases: 'T'.repeat(20), templateStart: 10, templateEnd: 30 }],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'rev', name: 'Rev1', sequence: 'T'.repeat(20), color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const compact = primerFrameMetricsForDisplay(display, 12, 1.8)
    const bounds = primerFrameBounds(display, 0, 60, 28, 10, compact, 'reverse', {
      showArrow: false,
      labelFontSizePx: 11,
    })!

    const annealedBottom =
      glyphY({ char: '', kind: 'annealed', row: 0 }, compact, 'reverse', bounds.top) + compact.rowHeight * 0.5
    const label = primerLabelMetrics('Rev1', 11)
    expect(bounds.labelY).toBeCloseTo(annealedBottom + compact.labelGap + label.halfHeight, 5)
    expect(bounds.labelY - label.halfHeight).toBeGreaterThan(annealedBottom)
  })

  it('raises the name only when sideways placement cannot clear raised bases', () => {
    const template = `${'N'.repeat(10)}AAAAAAAA${'N'.repeat(20)}`
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 10,
      templateEnd: 18,
      components: [{ primerBases: 'TGTGTGTG', templateStart: 10, templateEnd: 18 }],
    }
    const display = buildPrimerFrameDisplay(
      { id: 'dense', name: 'VeryLongPrimerNameHere', sequence: 'TGTGTGTG', color: '#000', bindings: [layout] },
      template,
      layout,
    )
    const compact = primerFrameMetricsForDisplay(display, 12, 1.8)
    const bounds = primerFrameBounds(display, 0, 60, 28, 10, compact, 'forward', {
      showArrow: false,
      labelFontSizePx: 11,
    })!
    const preferredY =
      glyphY({ char: '', kind: 'annealed', row: 0 }, compact, 'forward', bounds.top) -
      compact.rowHeight * 0.5 -
      compact.labelGap -
      primerLabelMetrics('VeryLongPrimerNameHere', 11).halfHeight

    expect(bounds.labelY).toBeLessThan(preferredY - 1)
  })

  it('reconciles shifted SnapGene hybridizedRange coordinates to binding site location', () => {
    const template = 'A'.repeat(5160) + 'CTTCTCAAAAGTCTGCTAG' + 'A'.repeat(100)
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 5160,
      templateEnd: 5179,
      components: [
        { primerBases: 'AGAGAG' },
        { primerBases: 'CTAGCAGACTTTTGAGAAG', templateStart: 5181, templateEnd: 5200 },
      ],
    }
    const reconciled = reconcileImportedBindingLayout(template, layout)
    const anneal = reconciled.components.find((component) => component.templateStart !== undefined)
    expect(anneal?.templateStart).toBe(5160)
    expect(anneal?.templateEnd).toBe(5179)
    expect(resolveDisplayablePrimerSites(makeRecord(template, [{
      id: 'nhe',
      name: 'NHE NP primer rev',
      sequence: 'AGAGAGCTAGCAGACTTTTGAGAAG',
      color: '#7c3aed',
      bindings: [reconciled],
    }])).displays).toHaveLength(1)
  })

  it('maps SnapGene reverse layout pairing onto the written oligo 5′→3′', () => {
    const left = 'GCCCAGCCGGCGATGGCC'
    const insert = 'TCACACGAGCACGAGCACGA'
    const right = 'GGGTTCTAGAGAG'
    const template = `${'N'.repeat(10)}${left}AT${right}${'N'.repeat(10)}`
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 10 + left.length + 2 + right.length,
      components: [
        { primerBases: left, templateStart: 10, templateEnd: 10 + left.length },
        { primerBases: insert },
        { primerBases: right, templateStart: 10 + left.length + 2, templateEnd: 10 + left.length + 2 + right.length },
        { primerBases: 'TTG' },
      ],
    }
    const sequence = 'CAACTCTCTAGAACCCTCGTGCTCGTGCTCGTGTGAGGCCATCGCCGGCTGGGC'
    const mask = annealMaskFromBindingLayout(template, sequence, layout)
    expect(mask.slice(0, 3).every((bit) => !bit)).toBe(true)
    expect(mask.slice(-left.length).every(Boolean)).toBe(true)
    expect(mask.slice(3, 3 + right.length).filter(Boolean).length).toBe(right.length)
  })

  it('previews the sequence-pane reverse site instead of a stored forward 3′ overhang', () => {
    const left = 'GCCCAGCCGGCGATGGCC'
    const insert = 'TCACACGAGCACGAGCACGA'
    const right = 'GGGTTCTAGAGAG'
    const template = `${'N'.repeat(10)}${left}AT${right}${'N'.repeat(10)}`
    const reverseLayout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 10,
      templateEnd: 10 + left.length + 2 + right.length,
      components: [
        { primerBases: left, templateStart: 10, templateEnd: 10 + left.length },
        { primerBases: insert },
        { primerBases: right, templateStart: 10 + left.length + 2, templateEnd: 10 + left.length + 2 + right.length },
        { primerBases: 'TTG' },
      ],
    }
    const forwardLayout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 0,
      templateEnd: 28,
      components: [
        { primerBases: 'C' },
        { primerBases: 'AACT', templateStart: 0, templateEnd: 4 },
        { primerBases: 'CTCTAGAACCCTC' },
        { primerBases: 'GTGCTCGTGCTCGTGTGAGGCCATCGCC', templateStart: 0, templateEnd: 28 },
        { primerBases: 'GGCTGGGC' },
      ],
    }
    const sequence = 'CAACTCTCTAGAACCCTCGTGCTCGTGCTCGTGTGAGGCCATCGCCGGCTGGGC'
    const preview = primerEditorAnnealPreview(template, sequence, {
      preferredStrand: 'forward',
      bindings: [forwardLayout, reverseLayout],
    })
    expect(preview.strand).toBe('reverse')
    expect(preview.mask.slice(0, 3).every((bit) => !bit)).toBe(true)
    expect(preview.mask.slice(-left.length).every(Boolean)).toBe(true)
    expect(preview.annealedCount).toBe(left.length + right.length)
  })
})

describe('primerBindingLayoutRange', () => {
  it('uses templateStart/templateEnd as a half-open span', () => {
    const layout: PrimerBindingLayout = {
      strand: 'forward',
      templateStart: 20,
      templateEnd: 40,
      components: [{ primerBases: 'A'.repeat(20), templateStart: 20, templateEnd: 40 }],
    }
    expect(primerBindingLayoutRange(layout)).toEqual({ start: 20, end: 40 })
  })

  it('orders reverse-oriented template coordinates', () => {
    const layout: PrimerBindingLayout = {
      strand: 'reverse',
      templateStart: 40,
      templateEnd: 20,
      components: [{ primerBases: 'A'.repeat(20), templateStart: 20, templateEnd: 40 }],
    }
    expect(primerBindingLayoutRange(layout)).toEqual({ start: 20, end: 40 })
  })
})
