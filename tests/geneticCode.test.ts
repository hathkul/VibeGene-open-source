import { describe, expect, it } from 'vitest'
import {
  computeFeatureTranslationCells,
  defaultFeatureTranslationOptions,
  featureTranslationExtensionSpans,
  featureTranslationFromCells,
  formatAminoAcidCode,
  isTranslationCellFullyInRange,
  isTranslationCellSelectedInRange,
  rangeCoveringTranslationCells,
  translationCellDisplayFragments,
  translationCellStretch,
  translationSelectionPositionsForFragment,
  translationCellsFullyInRange,
  translationCopyTextFromCells,
  translationCopyTextFromMergedCells,
} from '../src/domain/geneticCode'

describe('formatAminoAcidCode', () => {
  it('returns one-letter codes unchanged', () => {
    expect(formatAminoAcidCode('G', 'one-letter')).toBe('G')
    expect(formatAminoAcidCode('*', 'one-letter')).toBe('*')
  })

  it('maps to three-letter codes', () => {
    expect(formatAminoAcidCode('G', 'three-letter')).toBe('Gly')
    expect(formatAminoAcidCode('M', 'three-letter')).toBe('Met')
    expect(formatAminoAcidCode('*', 'three-letter')).toBe('*')
  })
})

describe('featureTranslationFromCells', () => {
  it('joins amino acids into a protein sequence', () => {
    expect(
      featureTranslationFromCells([
        { aa: 'M', number: 1, positions: [0, 1, 2] },
        { aa: 'G', number: 2, positions: [3, 4, 5] },
        { aa: '*', number: 3, positions: [6, 7, 8] },
      ]),
    ).toBe('MG*')
  })
})

describe('translation stretch selection helpers', () => {
  const cells = [
    { aa: 'M', number: 1, positions: [0, 1, 2], featureId: 'cds' },
    { aa: 'G', number: 2, positions: [3, 4, 5], featureId: 'cds' },
    { aa: 'Y', number: 3, positions: [6, 7, 8], featureId: 'cds' },
    { aa: '*', number: 4, positions: [9, 10, 11], featureId: 'cds' },
  ]

  it('detects codons fully covered by a DNA range', () => {
    expect(isTranslationCellFullyInRange(cells[1]!, { start: 3, end: 9 })).toBe(true)
    expect(isTranslationCellFullyInRange(cells[1]!, { start: 3, end: 5 })).toBe(false)
    expect(translationCellsFullyInRange(cells, { start: 3, end: 9 }).map((cell) => cell.aa)).toEqual(['G', 'Y'])
  })

  it('copies only a stretch when two or more residues are selected', () => {
    expect(translationCopyTextFromCells(cells, { start: 3, end: 9 })).toBe('GY')
    expect(translationCopyTextFromCells(cells, { start: 3, end: 6 })).toBe('G')
    expect(translationCopyTextFromCells(cells, null)).toBe('MGY*')
  })

  it('copies a selection that spans two merged in-frame features', () => {
    // Two in-frame CDS features without a stop codon between them render as one
    // seamless translation, so one selection can cover both.
    const merged = [
      { aa: 'M', number: 1, positions: [0, 1, 2], featureId: 'cds-a' },
      { aa: 'W', number: 2, positions: [3, 4, 5], featureId: 'cds-a' },
      { aa: 'Y', number: 3, positions: [6, 7, 8], featureId: 'cds-b' },
      { aa: 'K', number: 4, positions: [9, 10, 11], featureId: 'cds-b' },
    ]
    expect(translationCopyTextFromMergedCells(merged, { start: 0, end: 12 })).toBe('MWYK')
    expect(translationCopyTextFromMergedCells(merged, { start: 3, end: 12 })).toBe('WYK')
    expect(translationCopyTextFromMergedCells(merged, null)).toBe('MWYK')
  })

  it('falls back to the whole merged stretch when no residue is fully selected', () => {
    expect(translationCopyTextFromMergedCells(cells, { start: 1, end: 2 })).toBe('MGY*')
    expect(translationCopyTextFromMergedCells([], { start: 0, end: 3 })).toBe('')
  })

  it('builds a DNA range covering a stretch of amino acids', () => {
    expect(rangeCoveringTranslationCells(cells.slice(1, 3))).toEqual({ start: 3, end: 9 })
  })

  it('slices ordered cells between two clicked residues', () => {
    expect(translationCellStretch(cells, cells[0]!, cells[2]!).map((cell) => cell.aa)).toEqual(['M', 'G', 'Y'])
    expect(translationCellStretch(cells, cells[2]!, cells[1]!).map((cell) => cell.aa)).toEqual(['G', 'Y'])
  })

  it('keeps a spanning codon selected when any of its parts is inside the range', () => {
    // A codon whose bases span a segment boundary: parts at 3 and at 10-11.
    const spanning = { aa: 'Q', number: 2, positions: [3, 10, 11], featureId: 'cds' }
    // Clicking the first fragment selects only the bases under that fragment.
    expect(isTranslationCellSelectedInRange(spanning, { start: 3, end: 4 })).toBe(true)
    // Clicking the second fragment selects only that part.
    expect(isTranslationCellSelectedInRange(spanning, { start: 10, end: 12 })).toBe(true)
    // A range covering neither part does not select the residue.
    expect(isTranslationCellSelectedInRange(spanning, { start: 5, end: 9 })).toBe(false)
    // A range spanning the gap covers the whole codon, so it counts as selected too.
    expect(isTranslationCellSelectedInRange(spanning, { start: 0, end: 12 })).toBe(true)
  })

  it('copies a spanning codon exactly once when only one fragment is selected', () => {
    const spanning = { aa: 'Q', number: 2, positions: [3, 10, 11], featureId: 'cds' }
    const merged = [
      { aa: 'M', number: 1, positions: [0, 1, 2], featureId: 'cds' },
      spanning,
      { aa: 'L', number: 3, positions: [12, 13, 14], featureId: 'cds' },
    ]
    // Only the first fragment of the spanning codon is selected: the codon is
    // still one amino acid, not two.
    expect(translationCopyTextFromMergedCells(merged, { start: 0, end: 4 })).toBe('MQ')
    expect(translationCopyTextFromMergedCells(merged, { start: 10, end: 15 })).toBe('QL')
  })

  it('selects only the fragment of a codon split across segments', () => {
    // A codon whose bases sit on both sides of a segment boundary.
    const spanning = { aa: 'Q', number: 2, positions: [3, 10, 11] }
    expect(translationSelectionPositionsForFragment(spanning, [3])).toEqual([3])
    expect(translationSelectionPositionsForFragment(spanning, [10, 11])).toEqual([10, 11])
  })

  it('selects the whole codon when it is merely clipped by a row edge', () => {
    // A contiguous codon drawn in two rows is one codon, so clicking either
    // drawn part selects all of its bases.
    const contiguous = { aa: 'M', number: 1, positions: [95, 96, 97] }
    expect(translationSelectionPositionsForFragment(contiguous, [95, 96])).toEqual([95, 96, 97])
  })

  it('projects a multipart codon into display-only glyph fragments', () => {
    const cell = { aa: 'Q', number: 2, positions: [3, 10, 11] }
    expect(translationCellDisplayFragments(cell)).toEqual([
      { positions: [3] },
      { positions: [10, 11] },
    ])
    expect(translationCellDisplayFragments(cell, 10, 12)).toEqual([{ positions: [10, 11] }])
    // The canonical cell stays whole for translation and clipboard paths.
    expect(featureTranslationFromCells([cell])).toBe('Q')
  })

  it('projects reverse multipart codons by genomic display runs, not reading direction', () => {
    const cell = { aa: 'Q', number: 2, positions: [8, 1, 0] }
    expect(translationCellDisplayFragments(cell)).toEqual([
      { positions: [0, 1] },
      { positions: [8] },
    ])
  })

  it('projects a circular-origin codon at both sequence ends and keeps its wrapped DNA range', () => {
    const cell = { aa: 'M', number: 1, positions: [11, 0, 1] }
    expect(translationCellDisplayFragments(cell)).toEqual([
      { positions: [0, 1] },
      { positions: [11] },
    ])
    expect(rangeCoveringTranslationCells([cell], { topology: 'circular', sequenceLength: 12 })).toEqual({ start: 11, end: 2 })
  })
})

describe('computeFeatureTranslationCells', () => {
  it('keeps a forward multipart boundary codon canonical while exposing two display runs', () => {
    const feature = {
      locations: [
        { start: 0, end: 4, strand: 'forward' as const },
        { start: 10, end: 12, strand: 'forward' as const },
      ],
    }
    const cells = computeFeatureTranslationCells(feature, 'ATGCNNNNNNAA', defaultFeatureTranslationOptions(2))
    expect(cells).toHaveLength(2)
    expect(cells[1]?.positions).toEqual([3, 10, 11])
    expect(translationCellDisplayFragments(cells[1]!)).toEqual([
      { positions: [3] },
      { positions: [10, 11] },
    ])
  })

  it('keeps a reverse multipart boundary codon canonical while exposing two display runs', () => {
    const feature = {
      locations: [
        { start: 0, end: 2, strand: 'reverse' as const },
        { start: 8, end: 12, strand: 'reverse' as const },
      ],
    }
    const options = { ...defaultFeatureTranslationOptions(2), readingFrame: -1 as const }
    const cells = computeFeatureTranslationCells(feature, 'AANNNNNNATGC', options)
    expect(cells).toHaveLength(2)
    expect(cells[1]?.positions).toEqual([8, 1, 0])
    expect(translationCellDisplayFragments(cells[1]!)).toEqual([
      { positions: [0, 1] },
      { positions: [8] },
    ])
  })

  it('extends CDS translation through the stop codon beyond the annotated CDS end', () => {
    const sequence = 'ATGTAC' + 'TAAGGG'
    const feature = { locations: [{ start: 0, end: 6, strand: 'forward' as const }] }
    const options = defaultFeatureTranslationOptions(1)
    const cells = computeFeatureTranslationCells(feature, sequence, options)
    expect(cells.map((cell) => cell.aa)).toEqual(['M', 'Y', '*'])
    expect(cells[2]?.positions).toEqual([6, 7, 8])
  })

  it('does not extend CDS fragments shorter than 2 annotated amino acids', () => {
    const sequence = 'AAA' + 'TAAGGG'
    const feature = { locations: [{ start: 0, end: 3, strand: 'forward' as const }] }
    const options = defaultFeatureTranslationOptions(1)
    const cells = computeFeatureTranslationCells(feature, sequence, options)
    expect(cells.map((cell) => cell.aa)).toEqual(['K'])
    expect(featureTranslationExtensionSpans(feature, cells, sequence.length)).toEqual([])
  })

  it('does not extend 1-aa reverse-strand CDS fragments', () => {
    const sequence = 'TTA' + 'TTT' + 'GGG'
    const feature = { locations: [{ start: 3, end: 6, strand: 'reverse' as const }] }
    const options = { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const }
    const cells = computeFeatureTranslationCells(feature, sequence, options)
    expect(cells).toHaveLength(1)
    expect(featureTranslationExtensionSpans(feature, cells, sequence.length)).toEqual([])
  })

  it('does not extend when the CDS already includes the stop codon', () => {
    const sequence = 'ATGTAA'
    const feature = { locations: [{ start: 0, end: 6, strand: 'forward' as const }] }
    const options = defaultFeatureTranslationOptions(1)
    const cells = computeFeatureTranslationCells(feature, sequence, options)
    expect(cells.map((cell) => cell.aa)).toEqual(['M', '*'])
  })

  it('wraps on circular sequences to find a downstream stop codon', () => {
    const sequence = 'TAAGGG' + 'ATGTAC'
    const feature = { locations: [{ start: 6, end: 12, strand: 'forward' as const }] }
    const options = defaultFeatureTranslationOptions(1)
    const cells = computeFeatureTranslationCells(feature, sequence, options, { topology: 'circular' })
    expect(cells.map((cell) => cell.aa)).toEqual(['M', 'Y', '*'])
    expect(cells[2]?.positions).toEqual([0, 1, 2])
  })

  it('reports separate extension spans when translation wraps on circular sequences', () => {
    const sequence = 'TAAGGG' + 'ATGTAC'
    const feature = { locations: [{ start: 6, end: 12, strand: 'forward' as const }] }
    const options = defaultFeatureTranslationOptions(1)
    const cells = computeFeatureTranslationCells(feature, sequence, options, { topology: 'circular' })
    expect(featureTranslationExtensionSpans(feature, cells, sequence.length)).toEqual([
      { start: 0, end: 3, strand: 'forward' },
    ])
  })

  it('translates reverse-strand CDS in transcription order', () => {
    const sequence = 'GTACAT' + 'TAA' + 'GGG'
    const feature = { locations: [{ start: 0, end: 6, strand: 'reverse' as const }] }
    const options = { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const }
    const cells = computeFeatureTranslationCells(feature, sequence, options)
    expect(cells.map((cell) => cell.aa)).toEqual(['M', 'Y'])
    expect(cells[0]?.positions).toEqual([5, 4, 3])
    expect(cells[1]?.positions).toEqual([2, 1, 0])
  })

  it('extends reverse-strand CDS translation through the stop codon beyond the annotated end', () => {
    const sequence = 'TTA' + 'GTACAT' + 'GGG'
    const feature = { locations: [{ start: 3, end: 9, strand: 'reverse' as const }] }
    const options = { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const }
    const cells = computeFeatureTranslationCells(feature, sequence, options)
    expect(cells.map((cell) => cell.aa)).toEqual(['M', 'Y', '*'])
    expect(cells[2]?.positions).toEqual([2, 1, 0])
  })

  it('applies negative reading-frame offsets on reverse-strand CDS without flipping orientation', () => {
    const sequence = 'NNN' + 'GTACAT' + 'NNN'
    const feature = { locations: [{ start: 3, end: 9, strand: 'reverse' as const }] }
    const frame1 = { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const }
    const frame2 = { ...defaultFeatureTranslationOptions(1), readingFrame: -2 as const }
    const cells1 = computeFeatureTranslationCells(feature, sequence, frame1)
    const cells2 = computeFeatureTranslationCells(feature, sequence, frame2)
    expect(cells1[0]?.positions).toEqual([8, 7, 6])
    expect(cells2[0]?.positions).toEqual([7, 6, 5])
  })

  it('treats negative reading frames as reverse-strand even when the feature is annotated forward', () => {
    const sequence = 'GTACAT' + 'TAA' + 'GGG'
    const feature = { locations: [{ start: 0, end: 6, strand: 'forward' as const }] }
    const reverseOnFeature = { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const }
    const reverseLocations = {
      locations: [{ start: 0, end: 6, strand: 'reverse' as const }],
    }
    const fromSignedFrame = computeFeatureTranslationCells(feature, sequence, reverseOnFeature)
    const fromReverseLocation = computeFeatureTranslationCells(
      reverseLocations,
      sequence,
      reverseOnFeature,
    )
    expect(fromSignedFrame.map((cell) => cell.aa)).toEqual(['M', 'Y'])
    expect(fromSignedFrame.map((cell) => cell.positions)).toEqual(fromReverseLocation.map((cell) => cell.positions))
  })

  it('treats positive reading frames as forward-strand even when the feature is annotated reverse', () => {
    const sequence = 'ATGTAC' + 'TAA'
    const feature = { locations: [{ start: 0, end: 6, strand: 'reverse' as const }] }
    const cells = computeFeatureTranslationCells(feature, sequence, defaultFeatureTranslationOptions(1))
    expect(cells.map((cell) => cell.aa)).toEqual(['M', 'Y', '*'])
    expect(cells[0]?.positions).toEqual([0, 1, 2])
  })
})
