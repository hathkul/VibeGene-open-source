import { describe, expect, it } from 'vitest'
import { defaultConstructProperties, normalizeDnaDocumentData } from './constructProperties'
import { withPackedLibraryMemberFeatures } from './libraryMemberFeatures'
import {
  hydrateLibraryMemberHistoryOntoTraces,
  packLibraryMemberHistory,
} from './libraryMemberHistory'
import { rebuildDnaLibraryConsensusAsync } from './dnaLibrary'
import type { TraceFileRecord } from './traceTypes'
import type { HistoryNode, SequenceRecord } from './types'

function history(id: string, children: HistoryNode[] = []): HistoryNode {
  return {
    id,
    name: `History ${id}`,
    seqLen: 12,
    circular: true,
    operation: 'clone',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'ACGTACGTACGT',
    children,
  }
}

function trace(id: string, node?: HistoryNode): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'ACGTACGTACGT',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: true,
    alignment: null,
    ...(node ? { history: node } : {}),
  }
}

function record(): SequenceRecord {
  return {
    id: 'library', name: 'Library', description: '', molecule: 'dna', topology: 'linear', sequence: 'ACGT',
    features: [], primers: [], operations: [], construct: defaultConstructProperties,
    createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
    dna: { documentRole: 'library' },
  }
}

describe('library member history packing', () => {
  it('honors an already-aborted consensus rebuild even when no member can seed it', async () => {
    const controller = new AbortController()
    controller.abort()
    const disabled = { ...trace('disabled'), enabled: false }
    await expect(
      rebuildDnaLibraryConsensusAsync('ACGT', [disabled], 'linear', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('writes shared subtrees once and hydrates independent histories', () => {
    const sharedVector = history('vector', [history('ancestor')])
    const traces = [
      trace('one', history('one-root', [sharedVector])),
      trace('two', history('two-root', [sharedVector])),
    ]

    const packed = packLibraryMemberHistory(traces)
    expect(packed.entries).toHaveLength(2)
    expect(packed.entries.every((entry) => !('history' in entry))).toBe(true)
    expect(Object.keys(packed.pool.nodes)).toHaveLength(4)
    expect(packed.pool.nodes[packed.entries[0]!.historyRef]!.children)
      .toEqual(packed.pool.nodes[packed.entries[1]!.historyRef]!.children)

    const hydrated = hydrateLibraryMemberHistoryOntoTraces({
      dna: { libraryMemberHistory: packed.entries, libraryMemberHistoryPool: packed.pool },
    }, [trace('one'), trace('two')])
    expect(hydrated.map((entry) => entry.history)).toEqual(traces.map((entry) => entry.history))
    expect(hydrated[0]!.history).not.toBe(hydrated[1]!.history)
    expect(hydrated[0]!.history!.children[0]).not.toBe(hydrated[1]!.history!.children[0])
    hydrated[0]!.history!.children[0]!.name = 'mutated in member one'
    expect(hydrated[1]!.history!.children[0]!.name).toBe('History vector')

    const written = withPackedLibraryMemberFeatures(record(), traces)
    expect(written.dna?.libraryMemberHistory?.every((entry) => 'historyRef' in entry)).toBe(true)
    expect(written.dna?.libraryMemberHistoryPool?.nodes).toBeDefined()
  })

  it('hydrates legacy inline arrays and never aliases their history objects', () => {
    const shared = history('legacy-vector')
    const legacy = [
      { memberId: 'one', fileName: 'one.ab1', history: history('one-root', [shared]) },
      { memberId: 'two', fileName: 'two.ab1', history: history('two-root', [shared]) },
    ]
    const normalized = normalizeDnaDocumentData({ libraryMemberHistory: legacy })
    expect(normalized.libraryMemberHistory).toEqual(legacy)
    expect(normalized.libraryMemberHistoryPool).toBeUndefined()

    const hydrated = hydrateLibraryMemberHistoryOntoTraces({ dna: normalized }, [trace('one'), trace('two')])
    hydrated[0]!.history!.children[0]!.name = 'changed'
    expect(hydrated[1]!.history!.children[0]!.name).toBe('History legacy-vector')
  })

  it('pools a deep shared lineage without embedding descendants in every pool node', () => {
    let shared = history('leaf')
    for (let index = 0; index < 400; index += 1) shared = history(`vector-${index}`, [shared])
    const packed = packLibraryMemberHistory([
      trace('one', history('one-root', [shared])),
      trace('two', history('two-root', [shared])),
    ])
    // 401 shared lineage nodes plus two member roots: not two copied lineages.
    expect(Object.keys(packed.pool.nodes)).toHaveLength(403)
    expect(Object.values(packed.pool.nodes).every((node) => node.children.every((ref) => typeof ref === 'string'))).toBe(true)
  })
})
