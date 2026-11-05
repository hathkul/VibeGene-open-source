// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPrimerHybridizationParams, type PrimerHybridizationParams } from '../src/domain/primerHybridization'
import { isDnaLibraryRecord } from '../src/domain/dnaLibrary'
import type { Primer, SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import { selectedPrimersForMenu as selectedPrimersForMenuProjection } from '../src/application/primerWorkflow/primerPaneProjection'
import { usePrimerManagementController } from '../src/presentation/hooks/usePrimerManagementController'
import {
  usePrimerLibraryWorkflowController,
  type CommonPrimerLibraryEntry,
} from '../src/presentation/hooks/usePrimerLibraryWorkflowController'

const hybridization: PrimerHybridizationParams = {
  ...defaultPrimerHybridizationParams,
  minContinuousMatchLen: 4,
  minMeltingTemperature: 0,
}

function primer(id: string, name = id, sequence = 'ACGTACGT', extra?: Partial<Primer>): Primer {
  return { id, name, sequence, color: id, ...extra }
}

function record(primers: Primer[], extra?: Partial<SequenceRecord>): SequenceRecord {
  return {
    id: 'record', name: 'record', molecule: 'dna', topology: 'linear',
    sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
    features: [], primers, history: [],
    ...extra,
  } as unknown as SequenceRecord
}

function libraryRecord(primers: Primer[]): SequenceRecord {
  return record(primers, { dna: { documentRole: 'library' } } as Partial<SequenceRecord>)
}

function member(id: string, sequence: string, extra?: Partial<TraceFileRecord>): TraceFileRecord {
  return {
    id, fileName: `${id}.ab1`, sequence,
    chromatogram: {} as never, enabled: true, expanded: false, showAnnotations: true,
    alignment: null, primers: [],
    ...extra,
  }
}

type Management = ReturnType<typeof usePrimerManagementController>
type Library = ReturnType<typeof usePrimerLibraryWorkflowController>

function setup(initialRecord: SequenceRecord, initialMembers: TraceFileRecord[] = []) {
  const calls = {
    status: [] as string[],
    tagMapLoads: 0,
  }
  const storage = {
    library: [] as CommonPrimerLibraryEntry[],
    tagMap: new Map<string, string[]>(),
    addedDrafts: [] as CommonPrimerLibraryEntry[][],
    failList: null as Error | null,
  }
  const view = {
    library: null as unknown as Library,
    management: null as unknown as Management,
    record: initialRecord,
    hybridization,
    selectedPrimerId: null as string | null,
    selectedPrimerIds: [] as string[],
    selectionFocus: 'dna' as string,
    setRecord: null as unknown as (next: SequenceRecord) => void,
    selectPrimers: null as unknown as (ids: string[], focused?: string | null) => void,
  }

  function Harness() {
    const [currentRecord, setRecordState] = useState(initialRecord)
    const [members, setMembers] = useState(initialMembers)
    const [hybridizationParams, setHybridizationParams] = useState(hybridization)
    const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
    const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
    const [selectionFocus, setSelectionFocus] = useState<'dna' | 'feature' | 'primer' | 'bond'>('dna')

    view.record = currentRecord
    view.hybridization = hybridizationParams
    view.selectedPrimerId = selectedPrimerId
    view.selectedPrimerIds = selectedPrimerIds
    view.selectionFocus = selectionFocus
    view.setRecord = (next) => act(() => setRecordState(next))
    view.selectPrimers = (ids, focused) => act(() => {
      setSelectedPrimerIds(ids)
      setSelectedPrimerId(focused ?? ids[0] ?? null)
    })

    const context = (next: PrimerHybridizationParams = hybridizationParams) => ({
      record: currentRecord,
      members,
      isLibrary: isDnaLibraryRecord(currentRecord),
      referenceMemberId: null,
      hybridization: next,
    })
    const apply = (result: { record: SequenceRecord; members: TraceFileRecord[] }) => {
      setRecordState(result.record)
      setMembers(result.members)
    }
    const setStatus = (status: string) => {
      calls.status.push(status)
    }

    const management = usePrimerManagementController(currentRecord, setRecordState, {
      getTraceFiles: () => members,
      getAlignmentsVisible: () => false,
      getSelectedLibraryMember: () => null,
      getSelectedPrimers: () => selectedPrimersForMenuProjection(currentRecord, null, { selectedPrimerId, selectedPrimerIds }),
      getPrimerBindings: () => [],
      openUnsavedRecordsInNewTabs: () => {},
      setSequenceScrollTarget: () => {},
      selectedAlignmentTraceId: null,
      setSelectedAlignmentTraceId: () => {},
      selectedRange: null,
      cutStrandSelection: null,
      activeTab: 'Sequence',
      hybridization: hybridizationParams,
      context,
      apply,
      setStatus,
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectionFocus,
      setSelectedFeatureId: () => {},
      setSelectedFeatureIds: () => {},
      setCutSelectionAnchor: () => {},
      setCutStrandSelection: () => {},
      setCutSelectionEnzymes: () => {},
      setSelectedRange: () => {},
      setSelectionAnchor: () => {},
    })
    view.management = management

    view.library = usePrimerLibraryWorkflowController(currentRecord, {
      getTraceFiles: () => members,
      getSelectedPrimers: () => selectedPrimersForMenuProjection(currentRecord, null, { selectedPrimerId, selectedPrimerIds }),
      hybridization: hybridizationParams,
      listCommonPrimers: async () => {
        if (storage.failList) throw storage.failList
        return storage.library
      },
      loadPrimerTagMap: async () => {
        calls.tagMapLoads += 1
        return storage.tagMap
      },
      filterPrimersByTag: (primers, tagMap, tag) =>
        primers.filter((entry) => (tagMap.get(entry.name) ?? []).includes(tag)),
      addCommonPrimers: async (drafts) => {
        storage.addedDrafts.push(drafts)
        const added: CommonPrimerLibraryEntry[] = []
        let skipped = 0
        for (const draft of drafts) {
          const exists = storage.library.some((entry) =>
            entry.name.toLowerCase() === draft.name.toLowerCase()
            && entry.sequence.toUpperCase() === draft.sequence.toUpperCase())
          if (exists) {
            skipped += 1
            continue
          }
          const stored = { ...draft }
          storage.library.push(stored)
          added.push(stored)
        }
        return { added, skipped }
      },
      libraryPrimerImportOptions: () => undefined,
      setPrimerHybridization: setHybridizationParams,
      setHybridizationParamsOpen: management.setHybridizationParamsOpen,
      context,
      apply,
      setStatus,
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectionFocus,
      preparePrimerImport: management.preparePrimerImport,
      refreshPrimerCommand: management.refreshPrimerCommand,
      addDatabasePrimerCommand: management.addDatabasePrimerCommand,
    })
    return null
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))

  return {
    view,
    calls,
    storage,
    unmount: () => act(() => root.unmount()),
  }
}

describe('usePrimerLibraryWorkflowController', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('reports an empty common-primer library', async () => {
    const env = setup(record([primer('p1')]))
    cleanup = env.unmount

    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.calls.status).toEqual([
      'Detecting common primers…',
      'No common primers in the library yet.',
    ])
    expect(env.view.library.commonPrimerMatches).toEqual([])
  })

  it('detects hybridizing library primers and flags ones already on the record', async () => {
    const env = setup(record([primer('p1', 'T7-F', 'ACGTACGT')]))
    cleanup = env.unmount
    env.storage.library = [
      { name: 'T7-F', sequence: 'ACGTACGT' },
      { name: 'noise', sequence: 'TTTTTTTT' },
    ]

    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.view.library.commonPrimerMatches).toHaveLength(1)
    expect(env.view.library.commonPrimerMatches![0]).toMatchObject({
      primer: { name: 'T7-F' },
      alreadyPresent: true,
    })
    expect(env.calls.status.at(-1)).toBe('Detected 1 common primer.')
  })

  it('reports when no common primers hybridize to the sequence', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.library = [{ name: 'noise', sequence: 'TTTTTTTT' }]

    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.view.library.commonPrimerMatches).toEqual([])
    expect(env.calls.status.at(-1)).toBe('No common primers hybridize to this sequence.')
  })

  it('scopes detection to a tag and reports an empty or unmatched tag scope', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.library = [
      { name: 'T7-F', sequence: 'ACGTACGT' },
      { name: 'M13', sequence: 'GTTTTCCCAGTCACGAC' },
    ]
    env.storage.tagMap = new Map([['T7-F', ['sequencing']]])

    await act(async () => { await env.view.library.detectCommonPrimersInDocument({ tag: 'sequencing' }) })
    expect(env.calls.tagMapLoads).toBe(1)
    expect(env.view.library.commonPrimerMatches!.map((match) => match.primer.name)).toEqual(['T7-F'])
    expect(env.calls.status.at(-1)).toBe('Detected 1 common primer tagged “sequencing”.')

    env.storage.tagMap = new Map([['T7-F', ['other']]])
    await act(async () => { await env.view.library.detectCommonPrimersInDocument({ tag: 'sequencing' }) })
    expect(env.view.library.commonPrimerMatches).toEqual([])
    expect(env.calls.status.at(-1)).toBe('No common primers are tagged “sequencing”.')

    env.storage.tagMap = new Map([['M13', ['sequencing']]])
    await act(async () => { await env.view.library.detectCommonPrimersInDocument({ tag: 'sequencing' }) })
    expect(env.calls.status.at(-1)).toBe('No common primers tagged “sequencing” hybridize to this sequence.')
  })

  it('does not load the tag map for the default all-primers scope', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.library = [{ name: 'T7-F', sequence: 'ACGTACGT' }]

    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.calls.tagMapLoads).toBe(0)
    expect(env.view.library.commonPrimerMatches).toHaveLength(1)
    expect(env.calls.status.at(-1)).toBe('Detected 1 common primer.')
  })

  it('surfaces storage failures as a detection failure status', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.failList = new Error('boom')

    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.calls.status.at(-1)).toBe('Common primer detection failed: boom')
    expect(env.view.library.commonPrimerMatches).toBeNull()
  })

  it('matches primers against library member sequences, skipping unparsed members', async () => {
    const env = setup(libraryRecord([]), [
      member('m1', 'CCCCGGGGAAAATTTT'),
      member('m2', 'TTTTGGGGCCCCAAAA', { parseError: 'bad trace' }),
    ])
    cleanup = env.unmount
    env.storage.library = [
      { name: 'MemberOnly', sequence: 'GGGGAAAA' },
      { name: 'UnparsedOnly', sequence: 'TTTTGGGG' },
    ]

    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.view.library.commonPrimerMatches!.map((match) => match.primer.name)).toEqual(['MemberOnly'])
    expect(env.calls.status.at(-1)).toBe('Detected 1 common primer.')
  })

  it('requires a selection before adding primers to the common library', async () => {
    const env = setup(record([primer('p1', 'T7-F', 'ACGTACGT')]))
    cleanup = env.unmount

    await act(async () => { await env.view.library.addSelectedPrimersToCommonLibrary() })
    expect(env.calls.status).toEqual(['Select a primer to add to Common primers.'])
    expect(env.storage.addedDrafts).toEqual([])
  })

  it('adds the selected primers to the common library and reports skips', async () => {
    const env = setup(record([
      primer('p1', 'T7-F', 'ACGTACGT'),
      primer('p2', 'M13', 'GTTTTCCCAGTCACGAC'),
    ]))
    cleanup = env.unmount

    env.view.selectPrimers(['p1'])
    await act(async () => { await env.view.library.addSelectedPrimersToCommonLibrary() })
    expect(env.storage.addedDrafts[0]).toEqual([
      { name: 'T7-F', sequence: 'ACGTACGT', color: 'p1', description: undefined },
    ])
    expect(env.calls.status.at(-1)).toBe('Added “T7-F” to Common primers.')

    env.view.selectPrimers(['p1', 'p2'])
    await act(async () => { await env.view.library.addSelectedPrimersToCommonLibrary() })
    expect(env.calls.status.at(-1)).toBe('Added “M13” to Common primers. Skipped 1 already in the library.')

    await act(async () => { await env.view.library.addSelectedPrimersToCommonLibrary() })
    expect(env.calls.status.at(-1)).toBe('Selected primer(s) are already in Common primers.')
  })

  it('inserts hybridizing database primers, normalizes entries, and selects the additions', () => {
    const env = setup(record([]))
    cleanup = env.unmount

    act(() => env.view.library.addDatabasePrimers([
      { name: 'DB-F', sequence: 'acgt acgt', color: 'primer-teal', description: 'from db' },
      { name: 'off-target', sequence: 'TTTTTTTT' },
      { name: 'empty', sequence: ' ' },
    ]))

    expect(env.view.record.primers).toHaveLength(1)
    const added = env.view.record.primers[0]!
    expect(added).toMatchObject({ name: 'DB-F', sequence: 'ACGTACGT', color: 'primer-teal', description: 'from db' })
    expect(env.view.selectedPrimerId).toBe(added.id)
    expect(env.view.selectedPrimerIds).toEqual([added.id])
    expect(env.view.selectionFocus).toBe('primer')
    expect(env.calls.status.at(-1)).toBe('Added primer DB-F to the current sequence. Discarded 1 that did not hybridize.')
  })

  it('reports multi-add, all-present, and none-hybridizing database picks', () => {
    const env = setup(record([]))
    cleanup = env.unmount

    act(() => env.view.library.addDatabasePrimers([{ name: 'off', sequence: 'TTTTTTTT' }]))
    expect(env.calls.status.at(-1)).toBe('None of 1 primer(s) hybridized under the current hybridization parameters.')

    act(() => env.view.library.addDatabasePrimers([
      { name: 'DB-F', sequence: 'ACGTACGT' },
      { name: 'DB-R', sequence: 'TACGTACG' },
    ]))
    expect(env.view.record.primers).toHaveLength(2)
    expect(env.calls.status.at(-1)).toBe('Added 2 of 2 primers that hybridize under current parameters.')

    act(() => env.view.library.addDatabasePrimers([{ name: 'DB-F again', sequence: 'acgtacgt' }]))
    expect(env.view.record.primers).toHaveLength(2)
    expect(env.calls.status.at(-1)).toBe('All selected primers are already on the current sequence.')
  })

  it('persists hybridization params and drops stored primers that no longer hybridize', () => {
    const env = setup(record([primer('p1', 'short', 'ACGTACGT')]))
    cleanup = env.unmount
    act(() => env.view.management.setHybridizationParamsOpen(true))
    env.view.selectPrimers(['p1'])

    act(() => env.view.library.saveHybridizationParameters({
      minContinuousMatchLen: 40,
      allowMismatch: false,
      minMeltingTemperature: 0,
    }))

    expect(env.view.hybridization).toEqual({ minContinuousMatchLen: 40, allowMismatch: false, minMeltingTemperature: 0 })
    expect(env.view.record.primers).toEqual([])
    expect(env.view.selectedPrimerId).toBeNull()
    expect(env.view.selectedPrimerIds).toEqual([])
    expect(env.calls.status.at(-1)).toBe('Updated hybridization parameters. Removed 1 primer that no longer hybridize.')
    expect(env.view.management.hybridizationParamsOpen).toBe(false)
  })

  it('keeps primers and selection when the new hybridization params still match', () => {
    const env = setup(record([primer('p1', 'binds', 'ACGTACGT')]))
    cleanup = env.unmount
    env.view.selectPrimers(['p1'])

    act(() => env.view.library.saveHybridizationParameters({
      minContinuousMatchLen: 6,
      allowMismatch: true,
      minMeltingTemperature: 0,
    }))

    expect(env.view.hybridization.minContinuousMatchLen).toBe(6)
    expect(env.view.record.primers).toHaveLength(1)
    expect(env.view.selectedPrimerIds).toEqual(['p1'])
    expect(env.calls.status.at(-1)).toBe('Updated primer hybridization parameters (applies to all primers).')
  })

  it('reads the latest record after the document changes', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.library = [{ name: 'T7-F', sequence: 'ACGTACGT' }]

    env.view.setRecord(record([], { sequence: 'GGGGGGGGGGGGGGGGGGGGGGGG' } as Partial<SequenceRecord>))
    await act(async () => { await env.view.library.detectCommonPrimersInDocument() })
    expect(env.calls.status.at(-1)).toBe('No common primers hybridize to this sequence.')

    act(() => env.view.library.addDatabasePrimers([{ name: 'DB-F', sequence: 'ACGTACGT' }]))
    expect(env.calls.status.at(-1)).toBe('None of 1 primer(s) hybridized under the current hybridization parameters.')
  })
})
