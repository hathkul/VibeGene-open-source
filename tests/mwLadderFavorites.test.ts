import { describe, expect, it } from 'vitest'
import { ladderById } from '../src/domain/agaroseGel'
import { defaultMwLadderId, sanitizeFavoriteIds } from '../src/domain/mwLadderFavorites'
import { DEFAULT_MW_LADDER_ID, type MwLadder } from '../src/domain/mwLadders'

const customLadder: MwLadder = {
  id: 'custom__marker',
  name: 'Custom marker',
  supplier: 'Custom',
  preferredUnits: 'bp',
  concentration: null,
  url: null,
  isDefault: false,
  fragments: [{ lengthBp: 500, mass: 1, format: 'normal' }],
}

describe('molecular-weight ladder domain helpers', () => {
  it('sanitizes favorites against caller-supplied custom ladders', () => {
    expect(
      sanitizeFavoriteIds(['custom__marker', 'missing', 'custom__marker', DEFAULT_MW_LADDER_ID], [
        customLadder,
      ]),
    ).toEqual(['custom__marker', DEFAULT_MW_LADDER_ID])
  })

  it('falls back to the catalog default when no supplied favorite is valid', () => {
    expect(sanitizeFavoriteIds(['missing'])).toEqual([DEFAULT_MW_LADDER_ID])
    expect(defaultMwLadderId({ favoriteIds: [] })).toBe(DEFAULT_MW_LADDER_ID)
  })

  it('resolves custom ladders supplied by its caller', () => {
    expect(ladderById(customLadder.id, [customLadder])).toBe(customLadder)
  })
})
