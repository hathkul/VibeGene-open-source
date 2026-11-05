import { describe, expect, it } from 'vitest'
import {
  resolveSequenceEnterTabRevealPosition,
  shouldScheduleEnterTabAnchorScroll,
  type SequenceEnterTabRevealInput,
} from './sequenceEnterTabRevealPosition'
import type { RestrictionSite, SequenceFeature } from '../../domain/types'

const site = (cutTop: number, cutBottom: number): RestrictionSite =>
  ({
    enzyme: 'EcoRI',
    start: 0,
    end: 6,
    match: 'GAATTC',
    cutTop,
    cutBottom,
  }) as unknown as RestrictionSite

const base = (): SequenceEnterTabRevealInput => ({
  selectionFocus: 'dna',
  selectedFeature: null,
  selectedPrimerId: null,
  selectedRange: null,
  primerBindings: [],
  cutSelectionEnzymes: null,
  cutSelectionAnchor: null,
  cutStrandSelection: null,
})

const feature = (start: number): SequenceFeature =>
  ({
    id: 'f1',
    type: 'CDS',
    locations: [{ start, end: start + 3 }],
  }) as SequenceFeature

describe('resolveSequenceEnterTabRevealPosition', () => {
  it('prefers feature start when feature focus is active', () => {
    expect(
      resolveSequenceEnterTabRevealPosition({
        ...base(),
        selectionFocus: 'feature',
        selectedFeature: feature(42),
      }),
    ).toBe(42)
  })

  it('uses primer range, then binding, under primer focus', () => {
    expect(
      resolveSequenceEnterTabRevealPosition({
        ...base(),
        selectionFocus: 'primer',
        selectedPrimerId: 'p1',
        selectedRange: { start: 10, end: 20 },
        primerBindings: [{ primer: { id: 'p1' }, start: 5 }],
      }),
    ).toBe(10)
    expect(
      resolveSequenceEnterTabRevealPosition({
        ...base(),
        selectionFocus: 'primer',
        selectedPrimerId: 'p1',
        primerBindings: [{ primer: { id: 'p1' }, start: 5 }],
      }),
    ).toBe(5)
  })

  it('falls through cut and range precedence', () => {
    expect(
      resolveSequenceEnterTabRevealPosition({
        ...base(),
        cutSelectionEnzymes: {
          upstream: site(8, 9),
          downstream: site(20, 21),
        },
        cutStrandSelection: { forward: { start: 7, end: 8 }, reverse: { start: 7, end: 8 } },
      }),
    ).toBe(7)
    expect(
      resolveSequenceEnterTabRevealPosition({
        ...base(),
        cutSelectionAnchor: site(12, 11),
      }),
    ).toBe(11)
    expect(
      resolveSequenceEnterTabRevealPosition({
        ...base(),
        selectedRange: { start: 3, end: 6 },
      }),
    ).toBe(3)
  })
})

describe('shouldScheduleEnterTabAnchorScroll', () => {
  it('skips nudge when the viewport center is already near the anchor', () => {
    expect(shouldScheduleEnterTabAnchorScroll(100, 125)).toBe(false)
    expect(shouldScheduleEnterTabAnchorScroll(100, 69)).toBe(true)
  })
})
