import { describe, expect, it } from 'vitest'
import {
  areTranslatedCdsInSameFrame,
  buildCdsTranslationByFeatureId,
  buildCdsTranslationRowGroups,
  buildIndexedTranslationCellsByGroup,
  downstreamInFrameTranslatedCds,
  firstTranslatedCodonPosition,
  mergeTranslationCellsForGroup,
  readingFramePreservingAminoAcids,
} from '../src/domain/cdsTranslationFrame'
import { translationCellsForRow } from '../src/domain/sequencePaneTranslationLayout'
import {
  defaultFeatureTranslationOptions,
  featureTranslationExtensionSpans as extensionSpansFromCells,
} from '../src/domain/geneticCode'
import type { SequenceFeature } from '../src/domain/types'

function translatedCds(
  id: string,
  start: number,
  end: number,
  strand: 'forward' | 'reverse' = 'forward',
): SequenceFeature {
  return {
    id,
    type: 'CDS',
    name: id,
    color: '#000',
    locations: [{ start, end, strand }],
    translateInSequenceView: true,
    translation: defaultFeatureTranslationOptions(1),
  }
}

describe('areTranslatedCdsInSameFrame', () => {
  it('treats abutting forward CDS features with matching frame as in-frame', () => {
    const upstream = translatedCds('a', 0, 6)
    const downstream = translatedCds('b', 6, 12)
    expect(areTranslatedCdsInSameFrame(upstream, downstream)).toBe(true)
  })

  it('treats abutting reverse CDS features with matching frame as in-frame', () => {
    const upstream = translatedCds('a', 11, 20, 'reverse')
    const downstream = translatedCds('b', 2, 11, 'reverse')
    expect(areTranslatedCdsInSameFrame(upstream, downstream)).toBe(true)
  })

  it('rejects downstream CDS when the inter-feature gap is not a multiple of three', () => {
    const upstream = translatedCds('a', 0, 6)
    const downstream = translatedCds('b', 7, 13)
    expect(areTranslatedCdsInSameFrame(upstream, downstream)).toBe(false)
  })

  it('treats RF3 after a 1 bp gap as the same continuous ORF as upstream RF1', () => {
    // SnapGene pattern (e.g. CD8 signal → VHH41): one unlabeled base + readingFrame 3
    // skips the two bases that finish that codon, so translation stays in one frame.
    const upstream = translatedCds('a', 0, 6)
    const downstream = {
      ...translatedCds('b', 7, 16),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 3 },
    }
    expect(areTranslatedCdsInSameFrame(upstream, downstream)).toBe(true)
  })
})

describe('buildCdsTranslationByFeatureId', () => {
  it('clips upstream translation before an in-frame downstream CDS', () => {
    const sequence = 'ATGTAC' + 'GGG' + 'TAAGGG'
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = translatedCds('cds2', 6, 12)
    const byFeature = buildCdsTranslationByFeatureId([upstream, downstream], sequence, 'linear')

    const upstreamCells = byFeature.get('cds1') ?? []
    const downstreamCells = byFeature.get('cds2') ?? []
    expect(upstreamCells.map((cell) => cell.aa)).toEqual(['M', 'Y'])
    expect(downstreamCells.map((cell) => cell.aa)).toEqual(['G', '*'])

    const upstreamPositions = new Set(upstreamCells.flatMap((cell) => cell.positions))
    const downstreamPositions = new Set(downstreamCells.flatMap((cell) => cell.positions))
    for (const position of downstreamPositions) {
      expect(upstreamPositions.has(position)).toBe(false)
    }

    expect(extensionSpansFromCells(upstream, upstreamCells, sequence.length)).toEqual([])
  })

  it('keeps the junction codon on upstream when downstream uses RF3 after a 1 bp gap', () => {
    // ATG TAC | T CT | AGA GTG TAA  →  M Y S R V *
    const sequence = 'ATGTACTCTAGAGTGTAA'
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = {
      ...translatedCds('cds2', 7, 18),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 3 },
    }
    const byFeature = buildCdsTranslationByFeatureId([upstream, downstream], sequence, 'linear')

    expect((byFeature.get('cds1') ?? []).map((cell) => cell.aa)).toEqual(['M', 'Y', 'S'])
    expect((byFeature.get('cds2') ?? []).map((cell) => cell.aa)).toEqual(['R', 'V', '*'])
  })

  it('keeps upstream extension when downstream CDS is out of frame', () => {
    const sequence = 'ATGTAC' + 'TAAGGG'
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = {
      ...translatedCds('cds2', 6, 12),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 2 },
    }
    const byFeature = buildCdsTranslationByFeatureId([upstream, downstream], sequence, 'linear')

    const upstreamCells = byFeature.get('cds1') ?? []
    expect(upstreamCells.map((cell) => cell.aa)).toEqual(['M', 'Y', '*'])
    expect(extensionSpansFromCells(upstream, upstreamCells, sequence.length)).toEqual([
      { start: 6, end: 9, strand: 'forward' },
    ])
  })

  it('finds the nearest downstream in-frame CDS', () => {
    const upstream = translatedCds('cds1', 0, 6)
    const near = translatedCds('cds2', 6, 12)
    const far = translatedCds('cds3', 12, 18)
    expect(downstreamInFrameTranslatedCds(upstream, [far, near])).toBe(near)
  })
})

describe('buildCdsTranslationRowGroups', () => {
  it('groups abutting in-frame CDS features into one translation row', () => {
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = translatedCds('cds2', 6, 12)
    const groups = buildCdsTranslationRowGroups([upstream, downstream])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.features.map((feature) => feature.id)).toEqual(['cds1', 'cds2'])
  })

  it('groups RF1 + 1 bp gap + RF3 CDS features into one translation row', () => {
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = {
      ...translatedCds('cds2', 7, 16),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 3 },
    }
    const groups = buildCdsTranslationRowGroups([upstream, downstream])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.features.map((feature) => feature.id)).toEqual(['cds1', 'cds2'])
  })

  it('keeps out-of-frame CDS features on separate translation rows', () => {
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = {
      ...translatedCds('cds2', 6, 12),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 2 },
    }
    const groups = buildCdsTranslationRowGroups([upstream, downstream])
    expect(groups).toHaveLength(2)
  })

  it('merges chained in-frame CDS cells in transcription order', () => {
    const sequence = 'ATGTAC' + 'GGG' + 'TAAGGG'
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = translatedCds('cds2', 6, 12)
    const groups = buildCdsTranslationRowGroups([upstream, downstream])
    const cellsByFeatureId = buildCdsTranslationByFeatureId([upstream, downstream], sequence, 'linear')
    const merged = mergeTranslationCellsForGroup(groups[0]!, cellsByFeatureId)
    expect(merged.map((cell) => cell.aa)).toEqual(['M', 'Y', 'G', '*'])
    expect(merged.map((cell) => cell.featureId)).toEqual(['cds1', 'cds1', 'cds2', 'cds2'])
  })
})

describe('readingFramePreservingAminoAcids', () => {
  it('shifts forward frame when 5′ bound moves left (3..26 +2 → 2..26 +3)', () => {
    // 1-based 3..26 = 0-based start 2, end 26; frame +2 → first codon at genomic 3
    const previous = {
      ...translatedCds('cds', 2, 26),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 2 as const },
    }
    const next = readingFramePreservingAminoAcids(previous, [{ start: 1, end: 26, strand: 'forward' }])
    expect(next).toBe(3)
    expect(
      firstTranslatedCodonPosition({
        locations: [{ start: 1, end: 26, strand: 'forward' }],
        translation: { ...previous.translation, readingFrame: next },
      }),
    ).toBe(firstTranslatedCodonPosition(previous))
  })

  it('shifts reverse frame when 5′ (right) bound moves', () => {
    // Reverse CDS 1..9 with frame -2 → codon start at (9-1)-1 = 7
    const previous = {
      ...translatedCds('cds', 0, 9, 'reverse'),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: -2 as const },
    }
    const next = readingFramePreservingAminoAcids(previous, [{ start: 0, end: 10, strand: 'reverse' }])
    expect(next).toBe(-3)
    expect(
      firstTranslatedCodonPosition({
        locations: [{ start: 0, end: 10, strand: 'reverse' }],
        translation: { ...previous.translation, readingFrame: next },
      }),
    ).toBe(firstTranslatedCodonPosition(previous))
  })

  it('leaves frame unchanged when transcription 5′ bound is unchanged', () => {
    const previous = {
      ...translatedCds('cds', 2, 26),
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: 2 as const },
    }
    expect(readingFramePreservingAminoAcids(previous, [{ start: 2, end: 30, strand: 'forward' }])).toBe(2)
  })
})

describe('buildIndexedTranslationCellsByGroup', () => {
  it('matches mergeTranslationCellsForGroup and supports row queries', () => {
    const sequence = 'ATGTAC' + 'GGG' + 'TAAGGG'
    const upstream = translatedCds('cds1', 0, 6)
    const downstream = translatedCds('cds2', 6, 12)
    const groups = buildCdsTranslationRowGroups([upstream, downstream])
    const byFeature = buildCdsTranslationByFeatureId([upstream, downstream], sequence, 'linear')
    const indexed = buildIndexedTranslationCellsByGroup(groups, byFeature)
    expect(indexed).toHaveLength(1)
    expect(indexed[0]!.cells.map((cell) => cell.aa)).toEqual(['M', 'Y', 'G', '*'])
    expect(mergeTranslationCellsForGroup(groups[0]!, byFeature).map((cell) => cell.aa)).toEqual(['M', 'Y', 'G', '*'])
    expect(translationCellsForRow(indexed[0]!.cells, 0, 90).map((cell) => cell.aa)).toEqual(['M', 'Y', 'G', '*'])
    expect(translationCellsForRow(indexed[0]!.cells, 6, 12).map((cell) => cell.aa)).toEqual(['G', '*'])
  })
})
