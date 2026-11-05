import { describe, expect, it } from 'vitest'
import { parseActivity } from '../src/domain/crossVendorBufferActivity.ts'
import type { ObservedPoint } from '../src/domain/crossVendorBufferActivity.ts'
import {
  collectFitObservations,
  fitBufferObservations,
  buildCompositionGrid,
  formatGuess,
  guessToComposition,
  inferDoubleProprietaryActivity,
  type FitObservation,
} from '../src/domain/proprietaryBufferComposition.ts'
import type { RestrictionEnzyme } from '../src/domain/types.ts'

const methylation = { dam: 'No Effect', dcm: 'No Effect', ecoKI: 'No Effect' }

function activity(raw: string) {
  const parsed = parseActivity(raw)
  if (!parsed) throw new Error(raw)
  return parsed
}

function observedPoint(
  buffer: string,
  raw: string,
  guess: { salt: number; pH: number; anion: 'chloride' | 'acetate'; mg?: number },
): ObservedPoint {
  return {
    vendor: 'sibenzyme',
    buffer,
    activity: activity(raw),
    composition: guessToComposition({
      monovalentSalt_mM: guess.salt,
      mg_mM: guess.mg ?? 10,
      pH: guess.pH,
      anion: guess.anion,
      proteinCarrier: 'none',
      reductant: 'DTT',
    }),
  }
}

/** Chloride is salt-sensitive; acetate peaks at 50–66 mM (not 0 mM or 150 mM). */
function acetateLovingObservations(name: string, proprietaryPct: string): FitObservation {
  return {
    enzyme: name,
    measured: activity(proprietaryPct),
    sourceVendor: 'sibenzyme',
    observed: [
      observedPoint('b', '100', { salt: 0, pH: 7.6, anion: 'chloride' }),
      observedPoint('g', '40', { salt: 50, pH: 7.6, anion: 'chloride' }),
      observedPoint('o', '10', { salt: 100, pH: 7.6, anion: 'chloride' }),
      observedPoint('ac0', '35', { salt: 0, pH: 7.9, anion: 'acetate' }),
      observedPoint('ac50', '100', { salt: 50, pH: 7.9, anion: 'acetate' }),
      observedPoint('ac66', '100', { salt: 66, pH: 7.9, anion: 'acetate' }),
      observedPoint('ac100', '40', { salt: 100, pH: 7.9, anion: 'acetate' }),
    ],
  }
}

function acetateLovingSynthetic(name: string, proprietaryPct: string): RestrictionEnzyme {
  return {
    name,
    notation: 'A/A',
    recognition: 'AA',
    cutTop: 1,
    cutBottom: 1,
    type: 'II',
    overhang: { type: 'blunt', sequence: null, length: 0 },
    manufacturers: [
      {
        id: 'sibenzyme',
        name: 'SibEnzyme',
        bufferSystem: 'sibenzyme',
        productUrl: 'https://example.test/sib',
        incubationC: 37,
        preferredBuffer: 'y',
        bufferActivity: {
          b: '100',
          g: '40',
          o: '10',
          w: '10',
          y: '100',
          rose: proprietaryPct,
        },
        methylation,
      },
    ],
    notes: [],
  }
}

describe('proprietary buffer inverse fit', () => {
  it('recovers mid-salt acetate, not 150 mM chloride, for a salt-sensitive acetate-loving enzyme at 100% proprietary', () => {
    const observations = [
      acetateLovingObservations('FakeAI', '100'),
      acetateLovingObservations('FakeBI', '100'),
      acetateLovingObservations('FakeCI', '90-100'),
    ]

    const result = fitBufferObservations(observations, {
      id: 'sibenzyme:rose',
      vendor: 'sibenzyme',
      buffer: 'rose',
      grid: buildCompositionGrid({ grid: 'full' }),
      tiePrefer: { proteinCarrier: 'none', reductant: 'DTT' },
    })

    expect(result.best).toBeTruthy()
    expect(result.best!.anion).toBe('acetate')
    expect(result.best!.monovalentSalt_mM).toBeGreaterThanOrEqual(50)
    expect(result.best!.monovalentSalt_mM).toBeLessThanOrEqual(66)
    expect(result.best!.monovalentSalt_mM).not.toBe(150)
    expect(formatGuess(result.best!)).not.toMatch(/150 mM chloride/)
    expect(result.mae).not.toBeNull()
    expect(result.mae!).toBeLessThan(15)
  })

  it('skips NR proprietary activity and additive-required listings', () => {
    const nr: RestrictionEnzyme = {
      ...acetateLovingSynthetic('NrI', 'NR'),
      name: 'NrI',
    }
    const oligo: RestrictionEnzyme = {
      name: 'OligoI',
      notation: 'A/A',
      recognition: 'AA',
      cutTop: 1,
      cutBottom: 1,
      type: 'II',
      overhang: { type: 'blunt', sequence: null, length: 0 },
      manufacturers: [
        {
          id: 'sibenzyme',
          name: 'SibEnzyme',
          bufferSystem: 'sibenzyme',
          productUrl: 'https://example.test/sib',
          incubationC: 37,
          preferredBuffer: 'y',
          catalogNotes: ['requires oligo'],
          bufferActivity: {
            b: '100 (+oligo)',
            g: '100 (+oligo)',
            o: '100 (+oligo)',
            w: '100 (+oligo)',
            y: '100 (+oligo)',
            rose: '100',
          },
          methylation,
        },
      ],
      notes: [],
    }
    const observations = collectFitObservations([nr, oligo], {
      vendor: 'sibenzyme',
      buffer: 'rose',
      observedFrom: 'same-vendor',
    })
    expect(observations).toEqual([])
  })

  it('double-infers acetate-loving enzymes as high activity in fitted ONE, not as unknown', () => {
    const observations = [
      acetateLovingObservations('FakeAI', '100'),
      acetateLovingObservations('FakeBI', '100'),
    ]
    const result = inferDoubleProprietaryActivity(
      observations[0]!.observed,
      { needsAdditive: [], starInLowSalt: false, preferredIsSpecific: false },
      'eurx',
      'one',
    )
    expect(result).toBeTruthy()
    expect(result!.combinedConfidence).toBe('low')
    expect(result!.compositionConfidence).toBe('low')
    expect(result!.rationale).toMatch(/Double inference/)
    expect(result!.inferredHi).toBeGreaterThanOrEqual(70)
    expect(result!.inferredLo).toBeGreaterThan(20)
  })
})
