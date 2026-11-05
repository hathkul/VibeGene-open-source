import { describe, expect, it } from 'vitest'
import { canUseCompactHandoff } from './documentHandoff'
import type { SequenceRecord } from '../../domain/types'

const record = (overrides: Partial<SequenceRecord> = {}): SequenceRecord => ({
  id: 'record-1',
  name: 'Demo',
  molecule: 'dna',
  topology: 'linear',
  sequence: 'ACGT',
  features: [],
  primers: [],
  ...overrides,
} as SequenceRecord)

describe('canUseCompactHandoff', () => {
  it('allows ordinary records in the fast local-storage path', () => {
    expect(canUseCompactHandoff(record())).toBe(true)
  })

  it('requires the lossless store for traces, native history, or embedded protein sources', () => {
    expect(canUseCompactHandoff(record({ traceFiles: [{ id: 'trace-1', fileName: 'read.ab1', sequence: 'ACGT' }] as never }))).toBe(false)
    expect(canUseCompactHandoff(record({ snapGeneNativeHistory: { nodePackets: [] } as never }))).toBe(false)
    expect(canUseCompactHandoff(record({
      molecule: 'protein',
      protein: { translationDerivation: { sources: [{ sourceRecord: record() }] } },
    } as never))).toBe(false)
  })
})
