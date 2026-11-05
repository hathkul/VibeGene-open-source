import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { applyImportedTopology, planImportedRecordSelection, planUnsavedDownloadedRecordSelection, importedTraceSequenceName } from './documentImport'

describe('document import transitions', () => {
  it('plans first-feature selection and import status deterministically', () => {
    const record = cloneFixture()
    const plan = planImportedRecordSelection(record, 'vector.dna')
    expect(plan.selection).toEqual({ kind: 'neutral' })
    expect(plan.status).toContain('Imported vector.dna')
    expect(plan.showLibraryAlignments).toBe(false)
  })

  it('plans downloaded records without import status and strips AB1 suffixes', () => {
    const record = cloneFixture()
    expect(planUnsavedDownloadedRecordSelection(record).selection).toEqual({ kind: 'neutral' })
    expect(importedTraceSequenceName('read.ab1', 'Fallback')).toBe('read')
    expect(importedTraceSequenceName('read.txt', 'Fallback')).toBe('read.txt')
  })

  it('normalizes topology choices and linear DNA ends', () => {
    const record = cloneFixture()
    const circular = applyImportedTopology(record, 'circular')
    expect(circular.topology).toBe('circular')
    expect(circular.dnaEnds).toBeUndefined()
    const linear = applyImportedTopology(circular, 'linear')
    expect(linear.topology).toBe('linear')
    expect(linear.dnaEnds).toBeDefined()
  })
})
