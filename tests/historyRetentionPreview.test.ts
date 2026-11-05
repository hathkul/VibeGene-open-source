import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import type { HistoryRetentionPolicy } from '../src/domain/historyRetention'
import {
  analyzeHistoryTree,
  analyzeRecordHistory,
  previewHistoryTrim,
  previewHistoryTrimBatch,
} from '../src/domain/historyRetentionPreview'
import type {
  HistoryNode,
  ProteinTranslationSource,
  SequenceRecord,
} from '../src/domain/types'

function node(id: string, sequence: string | undefined, children: HistoryNode[] = []): HistoryNode {
  return {
    id,
    name: `${id}.dna`,
    seqLen: sequence?.length ?? 0,
    circular: false,
    operation: children.length ? 'assemble' : 'invalid',
    resurrectable: children.length === 0,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence,
    children,
  }
}

function dnaHistory() {
  return node('root', 'ROOT', [
    node('left', 'AAA', [node('grandparent', 'GG')]),
    node('right', undefined),
  ])
}

function nativePacket(type: number, payload: Uint8Array) {
  const output = new Uint8Array(5 + payload.byteLength)
  output[0] = type
  new DataView(output.buffer).setUint32(1, payload.byteLength, false)
  output.set(payload, 5)
  return output
}

function nativeNodePayload(id: number, nested: Uint8Array[]) {
  const length = 4 + nested.reduce((total, packet) => total + packet.byteLength, 0)
  const output = new Uint8Array(length)
  new DataView(output.buffer).setUint32(0, id, false)
  let offset = 4
  for (const packet of nested) {
    output.set(packet, offset)
    offset += packet.byteLength
  }
  return output
}

function dnaRecord(id = 'dna-1'): SequenceRecord {
  return {
    id,
    name: `${id}.dna`,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGGTTTAA',
    features: [],
    primers: [],
    operations: [
      { id: `${id}-op-1`, type: 'assemble', summary: 'Assembled', createdAt: '' },
      { id: `${id}-op-2`, type: 'edit', summary: 'Edited', createdAt: '' },
    ],
    history: dnaHistory(),
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

function fullSource(): ProteinTranslationSource {
  return {
    projectId: 'source-1',
    projectName: 'source-1.dna',
    sequenceDigest: 'fnv1a64:1111',
    cds: {
      featureName: 'CDS',
      locations: [{ start: 0, end: 9, strand: 'forward' }],
      translation: defaultFeatureTranslationOptions(1),
      nucleotideSequence: 'ATGGTTTAA',
      includedTerminalStop: true,
    },
    sourceRecord: {
      ...dnaRecord('source-1'),
      operations: [],
      history: node('source-root', 'ATGGTTTAA', [node('source-parent', 'ATGGTT')]),
      snapGeneNativeHistory: {
        nodePackets: [{
          nodeId: 'source-parent',
          payload: nativeNodePayload(1, [
            nativePacket(0x10, new Uint8Array([1, 2, 3])),
            nativePacket(0x11, new Uint8Array([4, 5])),
            nativePacket(0x0a, new Uint8Array([6])),
          ]),
        }],
      },
    },
  }
}

function referenceSource(): ProteinTranslationSource {
  return {
    projectId: 'source-2',
    projectName: 'source-2.dna',
    sequenceDigest: 'fnv1a64:2222',
    retention: 'reference-only',
  }
}

function proteinRecord(): SequenceRecord {
  return {
    id: 'protein-1',
    name: 'protein.prot',
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
        sources: [fullSource(), referenceSource()],
      },
    },
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

const keepAllPolicy: HistoryRetentionPolicy = {
  nativeAncestry: { mode: 'complete' },
  ancestorTraces: { mode: 'complete' },
  translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
  clearOperationLog: false,
}

describe('history retention analysis', () => {
  it('counts nodes, generations, leaves, and decoded ancestor bases', () => {
    expect(analyzeHistoryTree(dnaHistory())).toEqual({
      nodeCount: 4,
      ancestorCount: 3,
      ancestorGenerations: 2,
      leafCount: 2,
      truncatedBranchCount: 0,
      decodedSequenceCount: 3,
      decodedSequenceBases: 9,
      decodedAncestorSequenceCount: 2,
      decodedAncestorBases: 5,
    })
  })

  it('reports exact DNA ancestry and operation removals', () => {
    const preview = previewHistoryTrim(dnaRecord(), {
      ...keepAllPolicy,
      nativeAncestry: { mode: 'generations', generations: 1 },
      clearOperationLog: true,
    })

    expect(preview.changed).toBe(true)
    expect(preview.before.nativeHistory.nodeCount).toBe(4)
    expect(preview.after.nativeHistory.nodeCount).toBe(3)
    expect(preview.removed).toMatchObject({
      nativeHistoryNodes: 1,
      nativeDecodedSequences: 1,
      nativeDecodedSequenceBases: 2,
      operations: 2,
      newlyTruncatedBranches: 1,
    })
    expect(preview.details.nativeHistoryNodeIds).toEqual(['grandparent'])
    expect(preview.details.nativeDecodedSequenceNodeIds).toEqual(['grandparent'])
    expect(preview.details.operationIds).toEqual(['dna-1-op-1', 'dna-1-op-2'])
    expect(preview.serializedByteDelta).toBeLessThan(0)
    expect(preview.removed.serializedBytes).toBeGreaterThan(0)
  })

  it('previews removal of traces older than the retained trace generations', () => {
    const record = dnaRecord()
    const tracePackets = [
      nativePacket(0x10, new Uint8Array([1, 2, 3])),
      nativePacket(0x11, new Uint8Array([4, 5])),
      nativePacket(0x0a, new Uint8Array([6])),
    ]
    record.snapGeneNativeHistory = {
      nodePackets: [
        { nodeId: 'left', payload: nativeNodePayload(1, tracePackets) },
        { nodeId: 'grandparent', payload: nativeNodePayload(2, tracePackets) },
      ],
    }
    const preview = previewHistoryTrim(record, {
      ...keepAllPolicy,
      ancestorTraces: { mode: 'generations', generations: 1 },
    })

    expect(preview.before.nativeAncestorTraces).toEqual({ traceCount: 2, packetBytes: 30 })
    expect(preview.after.nativeAncestorTraces).toEqual({ traceCount: 1, packetBytes: 15 })
    expect(preview.removed).toMatchObject({
      nativeHistoryNodes: 0,
      nativeDecodedSequenceBases: 0,
      nativeAncestorTraces: 1,
      nativeAncestorTraceBytes: 15,
    })
    expect(preview.details.nativeAncestorTraceNodeIds).toEqual(['grandparent'])
    expect(preview.serializedByteDelta).toBeLessThan(0)
  })

  it('distinguishes embedded DNA, CDS-only, and reference-only provenance', () => {
    const metrics = analyzeRecordHistory(proteinRecord()).translationProvenance
    expect(metrics).toMatchObject({
      sourceCount: 2,
      embeddedDnaSourceCount: 1,
      cdsPayloadCount: 1,
      cdsOnlySourceCount: 0,
      referenceOnlySourceCount: 1,
      embeddedDnaBases: 9,
      embeddedDnaAncestorTraces: { traceCount: 1, packetBytes: 15 },
    })
    expect(metrics.embeddedDnaHistory.nodeCount).toBe(2)
    expect(metrics.embeddedDnaHistory.decodedAncestorBases).toBe(6)
    expect(metrics.referenceOnlySources).toEqual([{
      key: 'source-2#1',
      projectId: 'source-2',
      projectName: 'source-2.dna',
      sequenceDigest: 'fnv1a64:2222',
    }])
  })

  it('previews conversion of portable protein sources to reference-only metadata', () => {
    const preview = previewHistoryTrim(proteinRecord(), {
      ...keepAllPolicy,
      translationSources: { mode: 'reference-only' },
    })

    expect(preview.after.translationProvenance).toMatchObject({
      sourceCount: 2,
      embeddedDnaSourceCount: 0,
      cdsPayloadCount: 0,
      referenceOnlySourceCount: 2,
    })
    expect(preview.removed).toMatchObject({
      translationSources: 0,
      embeddedDnaSources: 1,
      embeddedDnaBases: 9,
      embeddedHistoryNodes: 2,
      embeddedDecodedSequences: 2,
      embeddedDecodedSequenceBases: 15,
      embeddedAncestorTraces: 1,
      embeddedAncestorTraceBytes: 15,
      cdsPayloads: 1,
      newlyReferenceOnlySources: 1,
    })
    expect(preview.details.embeddedDnaSources.map((source) => source.key)).toEqual(['source-1#0'])
    expect(preview.details.cdsPayloadSources.map((source) => source.key)).toEqual(['source-1#0'])
    expect(preview.details.embeddedHistory).toEqual([{
      source: {
        key: 'source-1#0',
        projectId: 'source-1',
        projectName: 'source-1.dna',
        sequenceDigest: 'fnv1a64:1111',
      },
      nodeIds: ['source-root', 'source-parent'],
      decodedSequenceNodeIds: ['source-root', 'source-parent'],
    }])
  })

  it('recognizes a complete-retention preview as a no-op', () => {
    const record = proteinRecord()
    const before = JSON.stringify(record)
    const preview = previewHistoryTrim(record, keepAllPolicy)
    expect(preview.changed).toBe(false)
    expect(preview.serializedByteDelta).toBe(0)
    expect(preview.removed.serializedBytes).toBe(0)
    expect(JSON.stringify(record)).toBe(before)
  })

  it('aggregates mixed-record previews and supports per-record policies', () => {
    const dna = dnaRecord()
    const protein = proteinRecord()
    const batch = previewHistoryTrimBatch([dna, protein], (record) => (
      record.molecule === 'protein'
        ? { ...keepAllPolicy, translationSources: { mode: 'cds-only' } }
        : { ...keepAllPolicy, nativeAncestry: { mode: 'remove' } }
    ))

    expect(batch.recordCount).toBe(2)
    expect(batch.changedRecordCount).toBe(2)
    expect(batch.records.map((preview) => preview.recordId)).toEqual(['dna-1', 'protein-1'])
    expect(batch.removed.nativeHistoryNodes).toBe(4)
    expect(batch.removed.embeddedDnaSources).toBe(1)
    expect(batch.removed.cdsPayloads).toBe(0)
    expect(batch.serializedByteDelta).toBeLessThan(0)
    expect(batch.beforeSerializedBytes - batch.afterSerializedBytes).toBe(batch.removed.serializedBytes)
  })
})
