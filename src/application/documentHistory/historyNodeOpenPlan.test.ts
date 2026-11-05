import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import {
  planConstructRecordFromHistoryNode,
  planHistoryRestrictionGelOpen,
} from './historyNodeOpenPlan'
import type { HistoryNode, SequenceRecord, SnapGeneNativeHistory } from '../../domain/types'

function historyNode(id: string, overrides: Partial<HistoryNode> = {}): HistoryNode {
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
    ...overrides,
  }
}

function liveRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: 'live-1',
    name: 'product.dna',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'TTTTTTTT',
    features: [],
    primers: [],
    history: historyNode('hist-current', { name: 'product.dna', sequence: 'TTTTTTTT', seqLen: 8 }),
    constructProperties: defaultConstructProperties,
    ...overrides,
  } as SequenceRecord
}

describe('historyNodeOpenPlan', () => {
  it('routes the current history node to the live record', () => {
    const record = liveRecord()
    const current = record.history!
    expect(planConstructRecordFromHistoryNode(record, current)).toBe(record)
  })

  it('reconstructs a parent node instead of reusing the live product', () => {
    const record = liveRecord()
    const parent = historyNode('parent-1', { name: 'parent.dna', sequence: 'AAAACCCC', seqLen: 8 })
    const opened = planConstructRecordFromHistoryNode(record, parent)
    expect(opened).not.toBe(record)
    expect(opened.sequence).toBe('AAAACCCC')
    expect(opened.name).toBe('parent')
  })

  it('builds restriction gel samples from the clicked parent node', () => {
    const parent = historyNode('1', {
      name: 'vector.dna',
      sequence: 'GGATCCCCGAATTC',
      seqLen: 13,
      circular: true,
    })
    const nativeHistory: SnapGeneNativeHistory = {
      nodePackets: [{ nodeId: '1', payload: new Uint8Array([0, 0, 0, 1]) }],
    }
    const plan = planHistoryRestrictionGelOpen(parent, ['EcoRI', 'BamHI'], nativeHistory)
    expect(plan?.source.sequence).toBe('GGATCCCCGAATTC')
    expect(plan?.source.topology).toBe('circular')
    expect(plan?.initialSamples[0]?.enzymeNames).toEqual(['EcoRI', 'BamHI'])
    expect(plan?.initialSamples[0]?.record).toBe(plan?.source)
  })

  it('skips restriction gel planning when no enzymes are selected', () => {
    const parent = historyNode('1')
    expect(planHistoryRestrictionGelOpen(parent, [], undefined)).toBeNull()
  })
})
