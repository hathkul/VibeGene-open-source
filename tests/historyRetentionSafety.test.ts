import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORY_RETENTION_DEFAULTS,
  normalizeHistoryRetentionDefaults,
  readHistoryRetentionDefaults,
  writeHistoryRetentionDefaults,
} from '../src/domain/historyRetentionPreferences'
import { dnaSequenceDigest } from '../src/domain/proteinTranslationProvenance'
import { verifyProteinSourceReferences } from '../src/domain/proteinSourceReferenceVerification'
import type { ProteinTranslationSource, SequenceRecord } from '../src/domain/types'

function record(id: string, sequence: string, molecule: SequenceRecord['molecule'] = 'dna'): SequenceRecord {
  return {
    id,
    name: `${id}.dna`,
    description: '',
    molecule,
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: {
      organism: '',
      accessionNumber: '',
      codeNumber: '',
      author: '',
      description: '',
      references: [],
    },
    createdAt: '',
    updatedAt: '',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('history retention defaults', () => {
  it('normalizes unsafe persisted values and round-trips user defaults', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
    expect(normalizeHistoryRetentionDefaults({
      nativeMode: 'invalid' as never,
      nativeGenerations: -4,
      recoveryDays: Number.NaN,
    })).toMatchObject({
      nativeMode: DEFAULT_HISTORY_RETENTION_DEFAULTS.nativeMode,
      nativeGenerations: 0,
      recoveryDays: DEFAULT_HISTORY_RETENTION_DEFAULTS.recoveryDays,
    })

    writeHistoryRetentionDefaults({
      ...DEFAULT_HISTORY_RETENTION_DEFAULTS,
      nativeMode: 'generations',
      nativeGenerations: 3,
      sourceMode: 'cds-only',
      recoveryDays: 14,
    })
    expect(readHistoryRetentionDefaults()).toMatchObject({
      nativeMode: 'generations',
      nativeGenerations: 3,
      sourceMode: 'cds-only',
      recoveryDays: 14,
    })
  })
})

describe('protein source reference verification', () => {
  it('distinguishes verified, missing, changed, and non-DNA database references', async () => {
    const exact = record('exact', 'ATGC')
    const changed = record('changed', 'AAAA')
    const protein = record('protein', 'M', 'protein')
    const projects = new Map([exact, changed, protein].map((entry) => [entry.id, entry]))
    const sources: ProteinTranslationSource[] = [
      {
        projectId: exact.id,
        projectName: exact.name,
        sequenceDigest: dnaSequenceDigest(exact.sequence),
      },
      {
        projectId: changed.id,
        projectName: changed.name,
        sequenceDigest: dnaSequenceDigest('ATGC'),
      },
      { projectId: protein.id, projectName: protein.name, sequenceDigest: dnaSequenceDigest('M') },
      { projectId: 'missing', projectName: 'missing.dna', sequenceDigest: dnaSequenceDigest('ATGC') },
      { projectId: exact.id, projectName: 'no-digest.dna', sequenceDigest: '' },
      { projectName: 'legacy.dna', sequenceDigest: '' },
    ]

    const result = await verifyProteinSourceReferences(
      sources,
      async (id) => projects.get(id) ?? null,
    )
    expect(result.map((entry) => entry.status)).toEqual([
      'verified',
      'sequence-mismatch',
      'wrong-molecule',
      'missing',
      'missing-digest',
      'missing-id',
    ])
  })
})
