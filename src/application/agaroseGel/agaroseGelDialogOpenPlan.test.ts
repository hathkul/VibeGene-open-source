import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { AgaroseGelDnaSource } from '../../domain/agaroseGelLibrary'
import type { SequenceRecord } from '../../domain/types'
import { planAgaroseGelDialogSnapshot } from './agaroseGelDialogOpenPlan'

function dnaRecord(name: string, sequence: string, overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: `id-${name}`,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('planAgaroseGelDialogSnapshot', () => {
  it('prefers explicit override samples over the library plan defaults', () => {
    const workspace = dnaRecord('pUC19', 'ACGTACGTACGT')
    const overrideSample: AgaroseGelDnaSource = {
      label: 'digest lane',
      record: dnaRecord('digest', 'AAAA'),
      enzymeNames: ['EcoRI'],
    }
    const snapshot = planAgaroseGelDialogSnapshot({
      workspaceRecord: workspace,
      currentTabId: 'tab-1',
      openedAt: 42,
      overrides: {
        initialSamples: [overrideSample],
        libraryMemberSources: [],
        currentSourceLabel: 'custom label',
      },
    })
    expect(snapshot.initialSamples).toHaveLength(1)
    expect(snapshot.initialSamples[0]!.label).toBe('digest lane')
    expect(snapshot.initialSamples[0]!.enzymeNames).toEqual(['EcoRI'])
    expect(snapshot.libraryMemberSources).toEqual([])
    expect(snapshot.currentSourceLabel).toBe('custom label')
    expect(snapshot.currentTabId).toBe('tab-1')
    expect(snapshot.openedAt).toBe(42)
  })

  it('uses workspace library context only when the live record is the workspace record', () => {
    const workspace = dnaRecord('library', 'ACGT', {
      dna: { documentRole: 'library' },
      traceFiles: [],
    } as Partial<SequenceRecord>)
    const historyRecord = dnaRecord('history digest', 'TTTT')
    const snapshot = planAgaroseGelDialogSnapshot({
      workspaceRecord: workspace,
      currentTabId: 'tab-2',
      openedAt: 99,
      traceFiles: [],
      selectedLibraryMemberIds: ['member-a'],
      overrides: {
        currentRecord: historyRecord,
        initialSamples: [{ label: 'lane', record: historyRecord }],
        libraryMemberSources: [],
        currentSourceLabel: historyRecord.name,
      },
    })
    expect(snapshot.currentRecord.name).toBe('history digest')
    expect(snapshot.initialSamples[0]!.record.name).toBe('history digest')
  })
})
