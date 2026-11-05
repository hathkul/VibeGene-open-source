import { describe, expect, it } from 'vitest'
import {
  assignSequencePaneLanesWithTranslations,
  packSequenceRowFeatureAndReversePrimerBands,
  packSkylineBands,
  sequenceRowVisibleBandHeights,
  sequencePaneTranslationLanesByFeatureId,
  sortTranslationCellsForRuler,
  translationCellOverlapsRow,
  translationCellsForRow,
  translationContiguousSpansOnRow,
  translationRulerRuns,
  translationSpanOnRow,
} from '../src/domain/sequencePaneTranslationLayout'

describe('sequencePaneTranslationLanesByFeatureId', () => {
  it('uses the feature-body lane when the body is on the row', () => {
    const lanes = sequencePaneTranslationLanesByFeatureId([
      { feature: { id: 'cds' }, lane: 0 },
      { feature: { id: 'cds' }, lane: 1, isInFrameExtension: true },
    ])
    expect(lanes.get('cds')).toBe(0)
  })

  it('falls back to the in-frame extension lane on continuation rows', () => {
    const lanes = sequencePaneTranslationLanesByFeatureId([
      { feature: { id: 'other' }, lane: 0 },
      { feature: { id: 'cds' }, lane: 1, isInFrameExtension: true },
    ])
    expect(lanes.get('cds')).toBe(1)
    expect(lanes.get('other')).toBe(0)
  })

  it('keeps distinct extension lanes when multiple CDS placeholders share a row', () => {
    const lanes = sequencePaneTranslationLanesByFeatureId([
      { feature: { id: 'cds-a' }, lane: 0, isInFrameExtension: true },
      { feature: { id: 'cds-b' }, lane: 1, isInFrameExtension: true },
      { feature: { id: 'promoter' }, lane: 2 },
    ])
    expect(lanes.get('cds-a')).toBe(0)
    expect(lanes.get('cds-b')).toBe(1)
    expect(lanes.get('promoter')).toBe(2)
  })
})

describe('translationSpanOnRow', () => {
  it('clips codon positions to the row window', () => {
    expect(
      translationSpanOnRow(
        [
          { positions: [8, 9, 10] },
          { positions: [95, 96, 97] },
        ],
        0,
        90,
      ),
    ).toEqual({ start: 8, end: 11 })
  })

  it('returns null when no cells fall on the row', () => {
    expect(translationSpanOnRow([{ positions: [100, 101, 102] }], 0, 90)).toBeNull()
  })
})

describe('translationContiguousSpansOnRow', () => {
  it('keeps gaps between short codon runs instead of one min-max band', () => {
    expect(
      translationContiguousSpansOnRow(
        [
          { aa: 'K', positions: [0, 1, 2] },
          { aa: 'Q', positions: [30, 31, 32] },
        ],
        0,
        90,
      ),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 30, end: 33 },
    ])
  })
})

describe('translationCellOverlapsRow', () => {
  it('includes codons that only partially overlap the row', () => {
    expect(translationCellOverlapsRow({ positions: [88, 89, 90] }, 90, 180)).toBe(true)
    expect(translationCellOverlapsRow({ positions: [87, 88, 89] }, 90, 180)).toBe(false)
  })
})

describe('translationCellsForRow', () => {
  const cells = [
    { aa: 'M', positions: [0, 1, 2], minPos: 0, maxPos: 2, featureId: 'a', number: 1 },
    { aa: 'K', positions: [30, 31, 32], minPos: 30, maxPos: 32, featureId: 'a', number: 2 },
    { aa: 'Q', positions: [95, 96, 97], minPos: 95, maxPos: 97, featureId: 'a', number: 3 },
  ]

  it('returns only cells overlapping the row window', () => {
    expect(translationCellsForRow(cells, 0, 90)).toEqual([cells[0], cells[1]])
    expect(translationCellsForRow(cells, 90, 180)).toEqual([cells[2]])
  })

  it('returns an empty list when no cells overlap', () => {
    expect(translationCellsForRow(cells, 180, 270)).toEqual([])
  })
})

describe('translationRulerRuns', () => {
  it('breaks the ruler after a stop codon and across genomic gaps', () => {
    const cells = sortTranslationCellsForRuler([
      { aa: 'M', positions: [0, 1, 2] },
      { aa: '*', positions: [3, 4, 5] },
      { aa: 'A', positions: [12, 13, 14] },
      { aa: 'C', positions: [9, 10, 11] },
    ])
    expect(translationRulerRuns(cells)).toEqual([
      { startIndex: 0, endIndex: 2 },
      { startIndex: 2, endIndex: 4 },
    ])
  })

  it('keeps multipart-codon display fragments from bridging their unannotated gap', () => {
    const displayFragments = sortTranslationCellsForRuler([
      { aa: 'M', positions: [0, 1, 2] },
      { aa: 'Q', positions: [3] },
      { aa: 'Q', positions: [10, 11] },
    ])
    expect(translationRulerRuns(displayFragments)).toEqual([
      { startIndex: 0, endIndex: 2 },
      { startIndex: 2, endIndex: 3 },
    ])
  })
})

describe('packSkylineBands', () => {
  it('checks primer collisions after applying feature precedence', () => {
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'left', ranges: [{ start: 0, end: 15 }], height: 40 },
        { id: 'right', ranges: [{ start: 25, end: 40 }], height: 40 },
      ],
      [
        { id: 'first', start: 10, end: 20, height: 12 },
        { id: 'second', start: 19, end: 30, height: 12 },
      ],
    )
    expect(layout.reversePrimerTopPxById.get('first')).toBe(40)
    expect(layout.reversePrimerTopPxById.get('second')).toBe(52)
  })
  it('lets reverse primers reuse levels when they do not collide with feature bands', () => {
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'feature-0', ranges: [{ start: 0, end: 40 }], height: 20 },
        { id: 'feature-1', ranges: [{ start: 0, end: 40 }], height: 20 },
      ],
      [
        { id: 'primer-0', start: 60, end: 72, height: 12 },
        { id: 'primer-1', start: 76, end: 90, height: 12 },
      ],
      20,
    )
    expect(layout.featureTopPxById.get('feature-0')).toBe(0)
    expect(layout.featureTopPxById.get('feature-1')).toBe(20)
    expect(layout.reversePrimerTopPxById.get('primer-0')).toBe(0)
    expect(layout.reversePrimerTopPxById.get('primer-1')).toBe(0)
    expect(layout.totalHeightPx).toBe(40)
    expect(sequenceRowVisibleBandHeights(layout, 1, 20)).toEqual({ featureContentHeightPx: 20, bandHeightPx: 20 })
  })

  it('keeps a primer below a feature it overlaps', () => {
    // The feature occupies the left part of the row on levels 0 and 1; the
    // primer binds the right part but overlaps the second feature. A primer
    // must never be placed above a feature it overlaps.
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'feature-0', ranges: [{ start: 0, end: 40 }], height: 20 },
        { id: 'feature-1', ranges: [{ start: 0, end: 40 }], height: 20 },
      ],
      [
        { id: 'primer-0', start: 30, end: 60, height: 12 },
      ],
      20,
    )
    expect(layout.featureTopPxById.get('feature-0')).toBe(0)
    expect(layout.featureTopPxById.get('feature-1')).toBe(20)
    // The primer overlaps feature-1, so it must sit below it.
    expect(layout.reversePrimerTopPxById.get('primer-0')).toBe(40)
  })

  it('keeps a primer below a feature when the primer starts earlier', () => {
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'feature-0', ranges: [{ start: 20, end: 60 }], height: 20 },
      ],
      [
        { id: 'primer-0', start: 10, end: 30, height: 12 },
      ],
      20,
    )
    // The primer starts further left, so a plain start-ordered skyline would
    // place it on level 0, above the feature it overlaps. The feature must win.
    expect(layout.reversePrimerTopPxById.get('primer-0')).toBe(20)
    expect(layout.featureTopPxById.get('feature-0')).toBe(0)
  })

  it('keeps a primer below a feature it overlaps when the primer starts in the middle of the feature', () => {
    // Feature occupies the left part of the row; the primer binds the right
    // part but its left end still overlaps the feature's right end.
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'feature-0', ranges: [{ start: 0, end: 50 }], height: 20 },
      ],
      [
        { id: 'primer-0', start: 40, end: 70, height: 12 },
      ],
      20,
    )
    expect(layout.featureTopPxById.get('feature-0')).toBe(0)
    expect(layout.reversePrimerTopPxById.get('primer-0')).toBe(20)
  })

  it('still lets a primer reuse a feature strip that ends before the primer starts', () => {
    // The #22 fix must survive: a primer to the right of a finished feature
    // may reuse that feature's level.
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'feature-0', ranges: [{ start: 0, end: 40 }], height: 20 },
      ],
      [
        { id: 'primer-0', start: 60, end: 72, height: 12 },
      ],
      20,
    )
    expect(layout.featureTopPxById.get('feature-0')).toBe(0)
    expect(layout.reversePrimerTopPxById.get('primer-0')).toBe(0)
  })

  it('keeps a primer below a feature it overlaps even when a gap in the feature row sits above it', () => {
    // Two features stack on levels 0 and 1 at the left of the row. The primer
    // binds the right end and overlaps only the second feature, but the first
    // feature leaves a horizontal gap at level 0. The primer must not rise into
    // that gap: it overlaps a feature, so it belongs below that feature.
    const layout = packSequenceRowFeatureAndReversePrimerBands(
      [
        { id: 'feature-0', ranges: [{ start: 0, end: 40 }], height: 20 },
        { id: 'feature-1', ranges: [{ start: 30, end: 70 }], height: 20 },
      ],
      [
        // A short primer fits in the gap the upper feature leaves behind, so
        // without the level rule it rises into that gap.
        { id: 'primer-0', start: 60, end: 72, height: 10 },
      ],
      20,
    )
    expect(layout.featureTopPxById.get('feature-0')).toBe(0)
    expect(layout.featureTopPxById.get('feature-1')).toBe(20)
    expect(layout.reversePrimerTopPxById.get('primer-0')).toBe(40)
  })

  it('reuses the freed upper strip after a translated CDS ends mid-row', () => {
    const tops = packSkylineBands([
      { id: 'cds', ranges: [{ start: 0, end: 40 }], height: 40, priority: -1000 },
      { id: 'promo', ranges: [{ start: 40, end: 70 }], height: 18, priority: 0 },
    ])
    expect(tops.get('cds')).toBe(0)
    expect(tops.get('promo')).toBe(0)
  })

  it('stacks overlapping translated bands', () => {
    const tops = packSkylineBands([
      { id: 'fwd', ranges: [{ start: 0, end: 50 }], height: 40, priority: -1000 },
      { id: 'rev', ranges: [{ start: 20, end: 60 }], height: 40, priority: -1000 },
    ])
    expect(tops.get('fwd')).toBe(0)
    expect(tops.get('rev')).toBe(40)
  })

  it('lets other features occupy gaps between discontinuous translation runs', () => {
    const tops = packSkylineBands([
      {
        id: 'tg',
        ranges: [
          { start: 0, end: 3 },
          { start: 40, end: 43 },
        ],
        height: 40,
        priority: -1000,
      },
      { id: 'promo', ranges: [{ start: 10, end: 30 }], height: 18, priority: 0 },
    ])
    expect(tops.get('tg')).toBe(0)
    expect(tops.get('promo')).toBe(0)
  })
})

describe('assignSequencePaneLanesWithTranslations', () => {
  it('puts opposite-strand overlapping translation groups on different lanes', () => {
    const lanes = assignSequencePaneLanesWithTranslations(
      [
        { segmentId: 'fwd-body', featureId: 'fwd', start: 10, end: 13 },
        { segmentId: 'rev-body', featureId: 'rev', start: 40, end: 43 },
      ],
      [
        { id: 'g-fwd', featureIds: ['fwd'], ranges: [{ start: 10, end: 70 }] },
        { id: 'g-rev', featureIds: ['rev'], ranges: [{ start: 20, end: 80 }] },
      ],
    )
    expect(lanes.get('fwd-body')).not.toBe(lanes.get('rev-body'))
  })

  it('keeps features of the same translation group on one lane', () => {
    const lanes = assignSequencePaneLanesWithTranslations(
      [
        { segmentId: 'a', featureId: 'cds-a', start: 0, end: 3 },
        { segmentId: 'b', featureId: 'cds-b', start: 30, end: 33 },
      ],
      [{ id: 'orf', featureIds: ['cds-a', 'cds-b'], ranges: [{ start: 0, end: 60 }] }],
    )
    expect(lanes.get('a')).toBe(lanes.get('b'))
  })

  it('lets non-overlapping translation groups share a lane', () => {
    const lanes = assignSequencePaneLanesWithTranslations(
      [
        { segmentId: 'a', featureId: 'cds-a', start: 0, end: 3 },
        { segmentId: 'b', featureId: 'cds-b', start: 50, end: 53 },
      ],
      [
        { id: 'g-a', featureIds: ['cds-a'], ranges: [{ start: 0, end: 20 }] },
        { id: 'g-b', featureIds: ['cds-b'], ranges: [{ start: 40, end: 60 }] },
      ],
    )
    expect(lanes.get('a')).toBe(lanes.get('b'))
  })

  it('packs non-translated features around translation bands', () => {
    const lanes = assignSequencePaneLanesWithTranslations(
      [
        { segmentId: 'cds', featureId: 'cds', start: 10, end: 40 },
        { segmentId: 'promo', featureId: 'promo', start: 0, end: 8 },
      ],
      [{ id: 'g-cds', featureIds: ['cds'], ranges: [{ start: 10, end: 40 }] }],
    )
    expect(lanes.get('cds')).toBe(0)
    expect(lanes.get('promo')).toBe(0)
  })
})
