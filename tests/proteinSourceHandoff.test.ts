import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../src/domain/fixtures'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import {
  attachProteinSourceRecords,
  detachProteinSourceRecords,
} from '../src/domain/proteinSourceHandoff'
import type { SequenceRecord } from '../src/domain/types'

describe('protein source handoff', () => {
  it('detaches and losslessly restores embedded source DNA', () => {
    const sourceRecord = cloneFixture()
    sourceRecord.snapGeneNativeHistory = {
      treeFingerprint: 'fnv1a32:source:10',
      nodePackets: [{ nodeId: '2', payload: new Uint8Array([1, 2, 3, 4]) }],
    }
    const protein: SequenceRecord = {
      id: 'protein',
      name: 'Protein',
      description: '',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'MV',
      protein: {
        numberingStart: 1,
        numberingRegions: [],
        bonds: [],
        translationDerivation: {
          kind: 'translated-cds',
          createdAt: '',
          sources: [{
            projectName: sourceRecord.name,
            sequenceDigest: 'fnv1a64:source',
            retention: 'complete',
            sourceRecord,
          }],
        },
      },
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    }

    const { record: shell, detached } = detachProteinSourceRecords(protein)
    expect(shell.protein?.translationDerivation?.sources[0]?.sourceRecord).toBeUndefined()
    expect(detached).toEqual([{ sourceIndex: 0, record: sourceRecord }])

    const hydrated = attachProteinSourceRecords(shell, detached)
    const restored = hydrated.protein?.translationDerivation?.sources[0]?.sourceRecord
    expect(restored).toBe(sourceRecord)
    expect(restored?.snapGeneNativeHistory?.nodePackets[0]?.payload).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    )
  })
})
