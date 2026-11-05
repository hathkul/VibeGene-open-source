import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../src/domain/fixtures'
import { normalizeSequenceRecord } from '../src/domain/constructProperties'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'

describe('DNA comparison persistence migration', () => {
  it('moves legacy comparative rows out of trace verification data', () => {
    const trace = traceRecordFromSequence('ATGC', 'verification.ab1')
    const legacyComparison = {
      ...traceRecordFromSequence('ATGA', 'homolog.seq'),
      id: 'comparison-1',
      alignmentPurpose: 'comparative' as const,
    }
    const normalized = normalizeSequenceRecord({
      ...cloneFixture(),
      traceFiles: [trace, legacyComparison],
    })
    expect(normalized.traceFiles?.map((entry) => entry.fileName)).toEqual(['verification.ab1'])
    expect(normalized.dna?.comparisonSources).toEqual([{
      id: 'comparison-1',
      name: 'homolog.seq',
      fileName: 'homolog.seq',
      sequence: 'ATGA',
      enabled: true,
    }])
  })
})
