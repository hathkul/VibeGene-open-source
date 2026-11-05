import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { TraceFileRecord } from '../../domain/traceTypes'
import {
  defaultLibraryMemberAlignmentTraceId,
  selectedAlignmentTraceExists,
  shouldClearSelectedAlignmentTraceId,
} from './libraryAlignmentTraceSelection'

function trace(id: string, overrides: Partial<TraceFileRecord> = {}): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'AT',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    ...overrides,
  }
}

describe('libraryAlignmentTraceSelection', () => {
  it('tracks whether the selected trace id exists in traceFiles', () => {
    const files = [trace('a'), trace('b')]
    expect(selectedAlignmentTraceExists('a', files)).toBe(true)
    expect(selectedAlignmentTraceExists('missing', files)).toBe(false)
    expect(selectedAlignmentTraceExists(null, files)).toBe(false)
  })

  it('clears when the selected id is missing from traceFiles', () => {
    expect(shouldClearSelectedAlignmentTraceId('missing', [trace('a')])).toBe(true)
    expect(shouldClearSelectedAlignmentTraceId('a', [trace('a')])).toBe(false)
    expect(shouldClearSelectedAlignmentTraceId(null, [trace('a')])).toBe(true)
  })

  it('defaults to the first enabled non-empty member when consensus is off', () => {
    const library = {
      ...cloneFixture(),
      dna: { ...cloneFixture().dna!, documentRole: 'library' as const, libraryConsensusEnabled: false },
    }
    const files = [
      trace('empty', { enabled: true, sequence: '' }),
      trace('disabled', { enabled: false, sequence: 'AT' }),
      trace('pick', { enabled: true, sequence: 'GC' }),
    ]
    expect(defaultLibraryMemberAlignmentTraceId(library, files)).toBe('pick')
  })

  it('does not default for non-library records or consensus-on libraries', () => {
    const construct = cloneFixture()
    expect(defaultLibraryMemberAlignmentTraceId(construct, [trace('a')])).toBeNull()
    const libraryConsensusOn = {
      ...cloneFixture(),
      dna: { ...cloneFixture().dna!, documentRole: 'library' as const, libraryConsensusEnabled: true },
    }
    expect(defaultLibraryMemberAlignmentTraceId(libraryConsensusOn, [trace('a')])).toBeNull()
  })
})
