import type { RestrictionEnzyme, RestrictionSite } from '../../src/domain/types'

export function restrictionEnzyme(
  partial: Partial<RestrictionEnzyme> & Pick<RestrictionEnzyme, 'name' | 'recognition'>,
): RestrictionEnzyme {
  return {
    notation: `${partial.recognition.slice(0, 1)}^${partial.recognition.slice(1)}`,
    cutTop: 1,
    cutBottom: 5,
    type: 'II',
    overhang: { type: "5'", sequence: 'AATT', length: 4 },
    manufacturers: [],
    notes: [],
    methylationRules: {
      dam: { effect: 'none', note: '' },
      dcm: { effect: 'none', note: '' },
      ecoKI: { effect: 'none', note: '' },
    },
    ...partial,
  }
}

export function restrictionSite(
  enzyme: RestrictionEnzyme,
  start: number,
  cuts: { cutTop: number; cutBottom: number },
): RestrictionSite {
  return {
    enzyme,
    start,
    end: start + enzyme.recognition.length,
    match: enzyme.recognition,
    cutTop: cuts.cutTop,
    cutBottom: cuts.cutBottom,
  }
}
