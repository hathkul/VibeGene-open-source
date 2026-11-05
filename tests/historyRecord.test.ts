// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { exportSnapGeneBlock8Xml } from '../src/domain/dnaEnds'
import { serializeCustomEnzymeSetsXml } from '../src/domain/snapgeneCustomEnzymeSets'
import {
  exportSnapGeneFeaturesXmlNative,
  exportSnapGeneNotesXmlNative,
  exportSnapGenePrimersXmlNative,
} from '../src/domain/snapgeneNativeExport'
import { exportSnapGeneStrandColorsXml } from '../src/domain/snapgeneStrandColors'
import { agaroseGelRecordFromHistoryNode, recordFromHistoryNode } from '../src/domain/historyRecord'
import { exportSnapGene, parseSnapGene, parseSnapGeneHistoryNodeDocumentData } from '../src/domain/parsers'
import { snapGeneNativeHistoryTraceMetrics, snapGeneNativeNodePayloadsForExport, trimSnapGeneNativeHistory } from '../src/domain/snapgeneNativeHistory'
import { encodeSnapGeneAlignmentPackets } from '../src/domain/snapgeneTraces'
import { compressSnapGeneBytesToXz, initSnapGeneLzma } from '../src/domain/snapgeneLzma'
import { snapshotParentalHistoryNode } from '../src/domain/snapgeneHistoryExport'
import { applyHistoryRetention, buildDnaHistoryRetentionPolicy } from '../src/domain/historyRetention'
import { analyzeRecordHistory } from '../src/domain/historyRetentionPreview'
import type { HistoryNode, SequenceRecord, SnapGeneNativeHistory } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

function packet(type: number, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(5 + payload.byteLength)
  output[0] = type
  new DataView(output.buffer).setUint32(1, payload.byteLength, false)
  output.set(payload, 5)
  return output
}

function nodePayload(
  nodeId: number,
  traces: TraceFileRecord[],
  documentPackets: readonly Uint8Array[] = [],
): Uint8Array {
  const id = new Uint8Array(4)
  new DataView(id.buffer).setUint32(0, nodeId, false)
  return concat([id, ...documentPackets, ...encodeSnapGeneAlignmentPackets(traces)])
}

function historyNode(id = '42'): HistoryNode {
  return {
    id,
    name: 'ancestor.dna',
    seqLen: 8,
    circular: false,
    operation: 'invalid',
    resurrectable: true,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'ACGTACGT',
    children: [],
  }
}

function trace(): TraceFileRecord {
  return {
    id: 'original-trace-id',
    fileName: 'ancestor-read.ab1',
    sequence: 'ACGTACGT',
    chromatogram: {
      aTrace: [8, 1, 1, 1, 8, 1, 1, 1],
      cTrace: [1, 8, 1, 1, 1, 8, 1, 1],
      gTrace: [1, 1, 8, 1, 1, 1, 8, 1],
      tTrace: [1, 1, 1, 8, 1, 1, 1, 8],
      basePos: [0, 1, 2, 3, 4, 5, 6, 7],
      baseCalls: 'ACGTACGT'.split(''),
    },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
  }
}

describe('history ancestor reconstruction', () => {
  beforeAll(async () => { await initSnapGeneLzma() })
  it('reads and strips traces inside compressed SnapGene parent packets without dropping metadata', () => {
    const hidden = { ...trace(), enabled: false }
    const metadata = packet(0x06, new TextEncoder().encode('<Notes><Description>Parent notes</Description></Notes>'))
    const compressed = packet(0x1e, compressSnapGeneBytesToXz(concat([...encodeSnapGeneAlignmentPackets([hidden]), metadata])))
    const node = historyNode()
    const payload = nodePayload(42, [], [compressed])
    const nativeHistory: SnapGeneNativeHistory = { nodePackets: [{ nodeId: '42', payload }] }
    const record = recordFromHistoryNode(node, nativeHistory, parseSnapGeneHistoryNodeDocumentData(payload))
    expect(record.description).toBe('Parent notes')
    expect(record.traceFiles?.[0]).toMatchObject({ fileName: hidden.fileName, enabled: false })
    expect(record.traceFiles?.[0]?.chromatogram.aTrace).toEqual(hidden.chromatogram.aTrace)
    expect(snapGeneNativeHistoryTraceMetrics(nativeHistory).traceCount).toBe(1)
    const stripped = trimSnapGeneNativeHistory(nativeHistory, node, { mode: 'complete' }, { mode: 'remove' })!
    expect(recordFromHistoryNode(node, stripped).traceFiles).toBeUndefined()
    expect(parseSnapGeneHistoryNodeDocumentData(stripped.nodePackets[0]!.payload)?.notes?.description).toBe('Parent notes')
  })
  it('saves a parent snapshot with its traces and restores them after reopening', () => {
    const parent = recordFromHistoryNode(historyNode())
    parent.traceFiles = [{ ...trace(), enabled: false }]
    parent.history = { ...parent.history!, children: [historyNode('99')] }
    parent.snapGeneNativeHistory = { nodePackets: [{ nodeId: '99', payload: nodePayload(99, [trace()]) }] }
    const parentNode = snapshotParentalHistoryNode(parent)
    const product = { ...parent, traceFiles: undefined, snapGeneNativeHistory: undefined, history: { ...historyNode('1'), children: [parentNode] } }
    expect(analyzeRecordHistory(product).nativeAncestorTraces.traceCount).toBe(2)
    const trimmed = applyHistoryRetention(product, buildDnaHistoryRetentionPolicy('complete', 1, false, 'remove'))
    expect(trimmed.history?.children[0]?.traceFiles).toBeUndefined()
    expect(analyzeRecordHistory(trimmed).nativeAncestorTraces.traceCount).toBe(0)
    const reopened = parseSnapGene(exportSnapGene(product), 'product.dna')
    const ancestor = reopened.history!.children[0]!
    const restored = recordFromHistoryNode(ancestor, reopened.snapGeneNativeHistory)
    expect(restored.traceFiles?.[0]).toMatchObject({ fileName: 'ancestor-read.ab1', enabled: false })
    expect(restored.traceFiles?.[0]?.chromatogram.aTrace).toEqual(parent.traceFiles[0]!.chromatogram.aTrace)
    const olderAncestor = ancestor.children[0]!
    expect(recordFromHistoryNode(olderAncestor, reopened.snapGeneNativeHistory).traceFiles?.[0]?.fileName).toBe('ancestor-read.ab1')
    expect(reopened.traceFiles).toBeUndefined()
  })
  it('only trusts complete end chemistry from history attributes', () => {
    const partial = historyNode()
    partial.upstreamModification = 'Unmodified'
    partial.upstreamStickiness = 4
    const partialRecord = recordFromHistoryNode(partial)
    expect(partialRecord.dnaEndsProvenance).toBeUndefined()

    const complete = historyNode()
    complete.upstreamModification = 'Unmodified'
    complete.upstreamStickiness = 4
    complete.downstreamModification = 'FivePrimePhosphorylated'
    complete.downstreamStickiness = -4
    const completeRecord = recordFromHistoryNode(complete)
    expect(completeRecord.dnaEndsProvenance).toBe('snapgene-history')
  })
  it('lazily decodes that ancestor’s embedded traces and scopes native packets', () => {
    const node = historyNode()
    const nativeHistory: SnapGeneNativeHistory = {
      treePayload: new Uint8Array([9, 9, 9]),
      treeFingerprint: 'source-tree',
      nodePackets: [
        { nodeId: '42', payload: nodePayload(42, [trace()]) },
        { nodeId: '99', payload: nodePayload(99, [trace()]) },
      ],
    }

    const record = recordFromHistoryNode(node, nativeHistory)

    expect(record.traceFiles).toHaveLength(1)
    expect(record.traceFiles?.[0]).toMatchObject({
      fileName: 'ancestor-read.ab1',
      sequence: 'ACGTACGT',
      enabled: true,
      alignment: null,
    })
    expect(record.traceFiles?.[0]?.chromatogram.aTrace.length).toBeGreaterThan(0)
    expect(record.description).toContain('1 embedded sequencing trace')
    expect(record.snapGeneNativeHistory?.treePayload).toBeUndefined()
    expect(record.snapGeneNativeHistory?.authoritativeRootPacketId).toBe('42')
    expect(record.snapGeneNativeHistory?.nodePackets.map((packet) => packet.nodeId)).toEqual(['42'])
    expect(snapGeneNativeNodePayloadsForExport(
      record.snapGeneNativeHistory,
      record.history,
      undefined,
    )).toEqual([nativeHistory.nodePackets[0]!.payload])
  })

  it('hydrates all recognized ancestor document metadata from native packets', () => {
    const encoder = new TextEncoder()
    const source: SequenceRecord = {
      id: 'rich-ancestor',
      name: 'rich-ancestor.dna',
      mapLabel: 'Historical map label',
      description: 'Original ancestor description',
      molecule: 'dna',
      topology: 'circular',
      sequence: 'ACGTACGT',
      features: [{
        id: 'feature-1',
        name: 'Detailed ancestral feature',
        type: 'misc_feature',
        color: '#123456',
        notes: 'note: original annotation\nlocus_tag: ANCESTOR_42',
        visible: false,
        cleavageArrows: [3],
        locations: [{ start: 1, end: 7, strand: 'reverse' }],
      }],
      primers: [{
        id: 'primer-1',
        name: 'Historical primer',
        sequence: 'ACGT',
        color: '#654321',
        description: 'Primer from the ancestor',
        visible: false,
        bindings: [{
          strand: 'forward',
          templateStart: 0,
          templateEnd: 4,
          components: [{ primerBases: 'ACGT', templateStart: 0, templateEnd: 4 }],
        }],
      }],
      strandColors: {
        type: 'Input',
        topStrand: [{ start: 1, end: 4, color: 'red' }],
        bottomStrand: [{ start: 4, end: 7, color: 'blue' }],
      },
      dnaEnds: {
        upstream: { modification: 'unmodified', stickiness: 4, enzymeName: 'BamHI' },
        downstream: { modification: 'covalentlyClosed', stickiness: -2, enzymeName: 'EcoRI' },
      },
      operations: [],
      construct: {
        ...defaultConstructProperties,
        syntheticDna: false,
        confirmedExperimentally: true,
        sourceOrganism: 'escherichia-coli',
        sequenceClass: 'PLN',
        accessionNumber: 'ANCESTOR42',
        codeNumber: 'CODE42',
        sequenceAuthor: 'Historical Author',
        comments: 'Historical comments',
        references: 'Historical paper PMID: 12345',
      },
      createdAt: '2020-01-02T03:04:05.000Z',
      updatedAt: '2021-02-03T04:05:06.000Z',
    }
    const customSets = [{ id: 'ancestor-set', name: 'Ancestor enzymes', enzymeNames: ['EcoRI', 'BamHI'] }]
    const nativePayload = nodePayload(42, [trace()], [
      packet(0x00, concat([new Uint8Array([0x0d]), encoder.encode(source.sequence)])),
      packet(0x0a, encoder.encode(exportSnapGeneFeaturesXmlNative(source))),
      packet(0x05, encoder.encode(exportSnapGenePrimersXmlNative(source))),
      packet(0x06, encoder.encode(exportSnapGeneNotesXmlNative(source))),
      packet(0x08, encoder.encode(exportSnapGeneBlock8Xml(source.dnaEnds!))),
      packet(0x14, encoder.encode(exportSnapGeneStrandColorsXml(source.strandColors!))),
      packet(0x02, new Uint8Array([2, 2, 2])),
      packet(0x03, new Uint8Array([3, 3, 3])),
      packet(0x0e, encoder.encode(serializeCustomEnzymeSetsXml(customSets))),
    ])
    const record = recordFromHistoryNode(
      historyNode(),
      { nodePackets: [{ nodeId: '42', payload: nativePayload }] },
      parseSnapGeneHistoryNodeDocumentData(nativePayload),
    )

    expect(record.sequence).toBe(source.sequence)
    expect(record.topology).toBe('circular')
    expect(record.mapLabel).toBe('Historical map label')
    expect(record.description).toBe('Original ancestor description')
    expect(record.createdAt).toBe(source.createdAt)
    expect(record.updatedAt).toBe(source.updatedAt)
    expect(record.construct).toMatchObject({
      syntheticDna: false,
      confirmedExperimentally: true,
      sourceOrganism: 'escherichia-coli',
      sequenceClass: 'PLN',
      accessionNumber: 'ANCESTOR42',
      codeNumber: 'CODE42',
      sequenceAuthor: 'Historical Author',
      comments: 'Historical comments',
      hostMethylation: { dam: true, dcm: true, ecoKI: false },
    })
    expect(record.features[0]).toMatchObject({
      name: 'Detailed ancestral feature',
      type: 'misc_feature',
      color: '#123456',
      visible: false,
      cleavageArrows: [3],
      locations: [{ start: 1, end: 7, strand: 'reverse' }],
    })
    expect(record.features[0]?.notes).toContain('locus_tag')
    expect(record.primers[0]).toMatchObject({
      name: 'Historical primer',
      sequence: 'ACGT',
      description: 'Primer from the ancestor',
      visible: false,
    })
    expect(record.primers[0]?.bindings).toHaveLength(1)
    expect(record.dnaEnds).toEqual(source.dnaEnds)
    expect(record.dnaEndsProvenance).toBe('snapgene-block8')
    expect(record.strandColors).toEqual(source.strandColors)
    expect(record.snapGeneEnzymes?.block2).toEqual(new Uint8Array([2, 2, 2]))
    expect(record.snapGeneEnzymes?.block3).toEqual(new Uint8Array([3, 3, 3]))
    expect(record.snapGeneEnzymes?.cachedSequenceLength).toBe(8)
    expect(record.fileEnzymeSets?.[0]).toMatchObject({
      name: 'Ancestor enzymes',
      enzymeNames: ['BamHI', 'EcoRI'],
    })
    expect(record.traceFiles).toHaveLength(1)
  })

  it('builds a gel snapshot from the clicked parent, not a colliding product id', () => {
    const parent = historyNode('1')
    parent.name = 'vector.dna'
    parent.sequence = 'GGATCCCCGAATTC'
    parent.seqLen = parent.sequence.length
    parent.circular = true

    const productPacket = nodePayload(1, [], [
      packet(0x00, concat([new Uint8Array([0]), new TextEncoder().encode('TTTTTTTTTTTTTT')])),
    ])
    const nativeHistory: SnapGeneNativeHistory = {
      nodePackets: [{ nodeId: '1', payload: productPacket }],
    }

    const gel = agaroseGelRecordFromHistoryNode(parent, nativeHistory)
    expect(gel.sequence).toBe('GGATCCCCGAATTC')
    expect(gel.topology).toBe('circular')
    expect(gel.name).toBe('vector')
    expect(gel.history).toBeUndefined()
    expect(gel.snapGeneNativeHistory).toBeUndefined()
    expect(gel.traceFiles).toBeUndefined()
    expect(() => JSON.stringify(gel)).not.toThrow()
  })
})
