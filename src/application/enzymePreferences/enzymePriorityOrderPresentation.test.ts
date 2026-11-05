import { describe, expect, it } from 'vitest'
import { enzymePriorityOrderSaveStatus } from './enzymePriorityOrderPresentation'

describe('enzymePriorityOrderSaveStatus', () => {
  it('uses exact status strings for empty, one-enzyme, and multi-enzyme orders', () => {
    expect(enzymePriorityOrderSaveStatus([])).toBe('Restored default enzyme priority order.')
    expect(enzymePriorityOrderSaveStatus(['EcoRI'])).toBe('Saved custom enzyme priority order (1 enzymes).')
    expect(enzymePriorityOrderSaveStatus(['EcoRI', 'BamHI'])).toBe('Saved custom enzyme priority order (2 enzymes).')
  })
})
