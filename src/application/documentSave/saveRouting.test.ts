import { describe, expect, it } from 'vitest'
import { planSaveToolbarAction } from './saveRouting'

describe('planSaveToolbarAction', () => {
  it('keeps trace documents read-only for every toolbar mode', () => {
    expect(planSaveToolbarAction(true, 'disk', 'save')).toBe('read-only')
    expect(planSaveToolbarAction(true, 'database', 'save-to')).toBe('read-only')
  })

  it('routes database toolbar commands to save, copy, or DNA export', () => {
    expect(planSaveToolbarAction(false, 'database', 'save')).toBe('save-database')
    expect(planSaveToolbarAction(false, 'database', 'save-to')).toBe('save-database-copy')
    expect(planSaveToolbarAction(false, 'database', 'save-dna')).toBe('export-database-dna')
  })

  it('uses Save As only for a disk DNA export and preserves copy intent elsewhere', () => {
    expect(planSaveToolbarAction(false, 'disk', 'save')).toBe('save-disk')
    expect(planSaveToolbarAction(false, 'disk', 'save-dna')).toBe('save-disk-as')
    expect(planSaveToolbarAction(false, 'new', 'save-to')).toBe('save-database-copy')
  })
})
