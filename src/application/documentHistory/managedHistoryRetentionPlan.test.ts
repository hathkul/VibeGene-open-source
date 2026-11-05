import { describe, expect, it } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import { buildDnaHistoryRetentionPolicy, buildProteinSourceHistoryRetentionPolicy } from '../../domain/historyRetention'
import type { HistoryTrimRemovalCounts } from '../../domain/historyRetentionPreview'
import {
  executeManagedNativeHistoryRetention,
  executeManagedProteinSourceHistoryRetention,
  planManagedNativeHistoryTrimStatus,
  planManagedProteinSourceHistoryTrimStatus,
} from './managedHistoryRetentionPlan'

function removal(overrides: Partial<HistoryTrimRemovalCounts> = {}): HistoryTrimRemovalCounts {
  return {
    nativeHistoryNodes: 0,
    nativeDecodedSequences: 0,
    nativeDecodedSequenceBases: 0,
    nativeAncestorTraces: 0,
    nativeAncestorTraceBytes: 0,
    translationSources: 0,
    embeddedDnaSources: 0,
    embeddedDnaBases: 0,
    embeddedHistoryNodes: 0,
    embeddedDecodedSequences: 0,
    embeddedDecodedSequenceBases: 0,
    embeddedAncestorTraces: 0,
    embeddedAncestorTraceBytes: 0,
    cdsPayloads: 0,
    operations: 0,
    serializedBytes: 0,
    newlyTruncatedBranches: 0,
    newlyReferenceOnlySources: 0,
    ...overrides,
  }
}

describe('planManagedNativeHistoryTrimStatus', () => {
  it('pluralizes nodes, bases, and traces for multi-count removals', () => {
    expect(planManagedNativeHistoryTrimStatus(removal({
      nativeHistoryNodes: 3,
      nativeDecodedSequenceBases: 1200,
      nativeAncestorTraces: 2,
    }))).toBe(
      `Trimmed history: removed 3 nodes, ${(1200).toLocaleString()} decoded bases, and 2 embedded traces. Use Undo to restore it.`,
    )
  })

  it('uses singular grammar for single-count removals', () => {
    expect(planManagedNativeHistoryTrimStatus(removal({
      nativeHistoryNodes: 1,
      nativeDecodedSequenceBases: 1,
      nativeAncestorTraces: 1,
    }))).toBe(
      'Trimmed history: removed 1 node, 1 decoded base, and 1 embedded trace. Use Undo to restore it.',
    )
  })
})

describe('planManagedProteinSourceHistoryTrimStatus', () => {
  it('pluralizes embedded sources, history nodes, and traces', () => {
    expect(planManagedProteinSourceHistoryTrimStatus(removal({
      embeddedDnaSources: 2,
      embeddedHistoryNodes: 4,
      embeddedAncestorTraces: 5,
    }))).toBe(
      'Trimmed protein source DNA: removed 2 embedded sources, 4 history nodes, and 5 traces. Use Undo to restore it.',
    )
  })

  it('uses singular grammar for single-count removals', () => {
    expect(planManagedProteinSourceHistoryTrimStatus(removal({
      embeddedDnaSources: 1,
      embeddedHistoryNodes: 1,
      embeddedAncestorTraces: 1,
    }))).toBe(
      'Trimmed protein source DNA: removed 1 embedded source, 1 history node, and 1 trace. Use Undo to restore it.',
    )
  })
})

describe('executeManagedNativeHistoryRetention', () => {
  it('updates record before closing the dialog and setting status', () => {
    const callOrder: string[] = []
    executeManagedNativeHistoryRetention(
      labPlasmid,
      buildDnaHistoryRetentionPolicy('current-only', 0, false),
      { closeHistoryManager: () => callOrder.push('close') },
      {
        updateRecord: () => callOrder.push('update'),
        setStatus: () => callOrder.push('status'),
      },
    )
    expect(callOrder).toEqual(['update', 'close', 'status'])
  })
})

describe('executeManagedProteinSourceHistoryRetention', () => {
  it('updates record before closing the protein-source dialog and setting status', () => {
    const callOrder: string[] = []
    executeManagedProteinSourceHistoryRetention(
      labPlasmid,
      buildProteinSourceHistoryRetentionPolicy('generations', 1),
      { closeProteinSourceHistoryManager: () => callOrder.push('close') },
      {
        updateRecord: () => callOrder.push('update'),
        setStatus: () => callOrder.push('status'),
      },
    )
    expect(callOrder).toEqual(['update', 'close', 'status'])
  })
})
