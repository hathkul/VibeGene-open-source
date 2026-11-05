// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { applyHistoryRetention } from '../src/domain/historyRetention'
import {
  exportProjectJson,
  exportSnapGene,
  parseProjectJson,
  parseSnapGene,
} from '../src/domain/parsers'
import { defaultSnapGeneExportOptions } from '../src/domain/snapgeneEnzymeExport'
import { snapGeneNativeHistoryTraceMetrics } from '../src/domain/snapgeneNativeHistory'
import type { HistoryNode, SequenceRecord } from '../src/domain/types'

function packet(type: number, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(5 + payload.byteLength)
  result[0] = type
  new DataView(result.buffer).setUint32(1, payload.byteLength, false)
  result.set(payload, 5)
  return result
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function packets(bytes: Uint8Array): Array<{ type: number; payload: Uint8Array }> {
  const result: Array<{ type: number; payload: Uint8Array }> = []
  let offset = 0
  while (offset + 5 <= bytes.byteLength) {
    const type = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.byteLength) break
    result.push({ type, payload: bytes.slice(start, end) })
    offset = end
  }
  return result
}

function historyNode(id: string, children: HistoryNode[] = []): HistoryNode {
  return {
    id,
    name: `${id}.dna`,
    seqLen: 4,
    circular: false,
    operation: children.length ? 'assemble' : 'invalid',
    resurrectable: children.length === 0,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    children,
  }
}

function sourceRecord(): SequenceRecord {
  return {
    id: 'source-1',
    name: 'native-history.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    history: historyNode('1', [historyNode('2')]),
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

function fixture(): { bytes: Uint8Array; nodePayload: Uint8Array; treePayload: Uint8Array } {
  const base = exportSnapGene(sourceRecord(), defaultSnapGeneExportOptions())
  const basePackets = packets(base)
  const treePayload = basePackets.find((entry) => entry.type === 0x07)!.payload
  const nodeId = new Uint8Array(4)
  new DataView(nodeId.buffer).setUint32(0, 2, false)
  const sequencePayload = concat([new Uint8Array([0x02]), new TextEncoder().encode('ATGC')])
  const opaqueTracePayload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02])
  const alignablePayload = new TextEncoder().encode('<AlignableSequences/>')
  const opaqueFeaturePayload = new TextEncoder().encode('<Features futureAttribute="kept"/>')
  const nodePayload = concat([
    nodeId,
    packet(0x00, sequencePayload),
    packet(0x10, opaqueTracePayload),
    packet(0x11, alignablePayload),
    packet(0x0a, opaqueFeaturePayload),
  ])
  const outputPackets = basePackets.flatMap((entry) => (
    entry.type === 0x07
      ? [packet(0x0b, nodePayload), packet(entry.type, entry.payload)]
      : [packet(entry.type, entry.payload)]
  ))
  return { bytes: concat(outputPackets), nodePayload, treePayload }
}

beforeAll(async () => {
  const { initSnapGeneLzma } = await import('../src/domain/snapgeneLzma')
  await initSnapGeneLzma()
})

describe('native SnapGene history preservation', () => {
  it('round-trips exact native history packets through VibeGene JSON and SnapGene export', () => {
    const original = fixture()
    const imported = parseSnapGene(original.bytes, 'native-history.dna')

    expect(imported.history?.children[0]?.sequence).toBe('ATGC')
    expect(imported.snapGeneNativeHistory?.treePayload).toEqual(original.treePayload)
    expect(imported.snapGeneNativeHistory?.nodePackets[0]?.payload).toEqual(original.nodePayload)

    const projectJson = exportProjectJson(imported)
    expect(JSON.parse(projectJson).schemaVersion).toBe(6)
    const reopened = parseProjectJson(projectJson).record
    expect(reopened.snapGeneNativeHistory?.treePayload).toEqual(original.treePayload)
    expect(reopened.snapGeneNativeHistory?.nodePackets[0]?.payload).toEqual(original.nodePayload)

    const exported = exportSnapGene(reopened, defaultSnapGeneExportOptions())
    expect(packets(exported).filter((entry) => entry.type === 0x0b).map((entry) => entry.payload))
      .toEqual([original.nodePayload])
    expect(packets(exported).find((entry) => entry.type === 0x07)?.payload)
      .toEqual(original.treePayload)

    const explicitlyWithoutHistory = exportSnapGene(reopened, { includeHistory: false })
    expect(packets(explicitlyWithoutHistory).some((entry) => entry.type === 0x07)).toBe(false)
    expect(packets(explicitlyWithoutHistory).some((entry) => entry.type === 0x0b)).toBe(false)
  })

  it('removes native sequence snapshots only when the user selects a trimming policy', () => {
    const imported = parseSnapGene(fixture().bytes, 'native-history.dna')
    const treeOnly = applyHistoryRetention(imported, {
      nativeAncestry: { mode: 'tree-only' },
      ancestorTraces: { mode: 'complete' },
      translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
      clearOperationLog: false,
    })
    const retainedPayload = treeOnly.snapGeneNativeHistory?.nodePackets[0]?.payload
    expect(retainedPayload).toBeDefined()
    expect(packets(retainedPayload!.slice(4)).map((entry) => entry.type)).toEqual([0x10, 0x11, 0x0a])
    expect(treeOnly.history?.children[0]?.sequence).toBeUndefined()

    const currentOnly = applyHistoryRetention(imported, {
      nativeAncestry: { mode: 'current-only' },
      ancestorTraces: { mode: 'complete' },
      translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
      clearOperationLog: false,
    })
    expect(currentOnly.snapGeneNativeHistory).toBeUndefined()
    expect(packets(exportSnapGene(currentOnly)).some((entry) => entry.type === 0x0b)).toBe(false)
  })

  it('removes only embedded ancestor trace packets when requested', () => {
    const imported = parseSnapGene(fixture().bytes, 'native-history.dna')
    imported.traceFiles = [{
      id: 'current-trace',
      fileName: 'current.ab1',
      sequence: 'ATGC',
      chromatogram: {
        aTrace: [], cTrace: [], gTrace: [], tTrace: [], basePos: [], baseCalls: ['A', 'T', 'G', 'C'],
      },
      enabled: true,
      expanded: false,
      showAnnotations: false,
      alignment: null,
    }]
    expect(snapGeneNativeHistoryTraceMetrics(imported.snapGeneNativeHistory)).toMatchObject({
      traceCount: 1,
      nodeIds: ['2'],
    })

    const trimmed = applyHistoryRetention(imported, {
      nativeAncestry: { mode: 'complete' },
      ancestorTraces: { mode: 'remove' },
      translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
      clearOperationLog: false,
    })
    const nestedTypes = packets(
      trimmed.snapGeneNativeHistory!.nodePackets[0]!.payload.slice(4),
    ).map((entry) => entry.type)
    expect(nestedTypes).toEqual([0x00, 0x0a])
    expect(trimmed.history).toEqual(imported.history)
    expect(trimmed.traceFiles).toEqual(imported.traceFiles)
    expect(snapGeneNativeHistoryTraceMetrics(trimmed.snapGeneNativeHistory)).toEqual({
      traceCount: 0,
      packetBytes: 0,
      nodeIds: [],
    })

    const exported = exportSnapGene(trimmed, defaultSnapGeneExportOptions())
    const exportedAncestor = packets(exported).find((entry) => entry.type === 0x0b)!.payload
    expect(packets(exportedAncestor.slice(4)).map((entry) => entry.type)).toEqual([0x00, 0x0a])
  })
})
