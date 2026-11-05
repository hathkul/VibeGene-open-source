// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { reverseComplement } from '../src/domain/sequence'
import { defaultPrimerHybridizationParams } from '../src/domain/primerHybridization'
import { isDnaLibraryRecord } from '../src/domain/dnaLibrary'
import type { HistoryNode, HistorySgRnaCloning, Primer, PrimerBindingLayout, SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import { selectedPrimersForMenu as selectedPrimersForMenuProjection } from '../src/application/primerWorkflow/primerPaneProjection'
import type { PrimerEditorState, SelectionRange } from '../src/presentation/sequence'
import { usePrimerManagementController } from '../src/presentation/hooks/usePrimerManagementController'

const hybridization = { ...defaultPrimerHybridizationParams, minContinuousMatchLen: 4, minMeltingTemperature: 0 }
const SENSE = 'AAACCCGGGTTTACGA'
const ANTISENSE = reverseComplement(SENSE)

function primer(id: string, name = id, sequence = 'ACGTACGT', extra?: Partial<Primer>): Primer {
  return { id, name, sequence, color: id, ...extra }
}

function record(primers: Primer[], extra?: Partial<SequenceRecord>): SequenceRecord {
  return {
    id: 'record', name: 'record', molecule: 'dna', topology: 'linear',
    sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
    features: [], primers,
    ...extra,
  } as unknown as SequenceRecord
}

function libraryRecord(primers: Primer[]): SequenceRecord {
  return record(primers, { dna: { documentRole: 'library' } } as Partial<SequenceRecord>)
}

function member(id: string, primers: Primer[] = []): TraceFileRecord {
  return {
    id, fileName: `${id}.ab1`, sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
    chromatogram: {} as never, enabled: true, expanded: false, showAnnotations: true,
    alignment: null, primers,
  }
}

function recipeNode(id: string, guideIds: string[], oligos: { name: string; sequence: string; guideId: string }[]): HistoryNode {
  return {
    id, children: [],
    sgRnaCloning: {
      version: 1,
      guides: guideIds.map((guideId) => ({
        sourceGuideId: guideId,
        name: `guide ${guideId}`,
        nuclease: 'SpCas9',
        targetSpacer: SENSE,
        expressedGuide: SENSE,
      })),
      oligos,
    } as unknown as HistorySgRnaCloning,
  } as unknown as HistoryNode
}

type Controller = ReturnType<typeof usePrimerManagementController>

function setup(initialRecord: SequenceRecord, initialMembers: TraceFileRecord[] = []) {
  const calls = {
    status: [] as string[],
    opened: [] as SequenceRecord[],
    scrollTargets: [] as (number | null)[],
  }
  const view = {
    controller: null as unknown as Controller,
    record: initialRecord,
    members: initialMembers,
    selectedPrimerIds: [] as string[],
    selectedPrimerId: null as string | null,
    selectionFocus: 'dna' as string,
    selectedAlignmentTraceId: null as string | null,
    setRecord: null as unknown as (next: SequenceRecord) => void,
    setMembers: null as unknown as (next: TraceFileRecord[]) => void,
    setSelectedLibraryMember: null as unknown as (next: TraceFileRecord | null) => void,
    setActiveTab: null as unknown as (next: string) => void,
    setAlignmentsVisible: null as unknown as (next: boolean) => void,
    setSelectedRangePort: null as unknown as (next: SelectionRange | null) => void,
    setSelectedAlignmentTraceId: null as unknown as (next: string | null) => void,
    selectPrimers: null as unknown as (ids: string[], focused?: string | null) => void,
  }

  function Harness() {
    const [currentRecord, setRecordState] = useState(initialRecord)
    const [members, setMembers] = useState(initialMembers)
    const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
    const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
    const [selectionFocus, setSelectionFocus] = useState<'dna' | 'feature' | 'primer' | 'bond'>('dna')
    const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>(null)
    const [selectedLibraryMember, setSelectedLibraryMember] = useState<TraceFileRecord | null>(null)
    const [activeTab, setActiveTab] = useState('Sequence')
    const [alignmentsVisible, setAlignmentsVisible] = useState(false)
    const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)

    view.record = currentRecord
    view.members = members
    view.selectedPrimerId = selectedPrimerId
    view.selectedPrimerIds = selectedPrimerIds
    view.selectionFocus = selectionFocus
    view.selectedAlignmentTraceId = selectedAlignmentTraceId
    view.setRecord = (next) => act(() => setRecordState(next))
    view.setMembers = (next) => act(() => setMembers(next))
    view.setSelectedLibraryMember = (next) => act(() => setSelectedLibraryMember(next))
    view.setActiveTab = (next) => act(() => setActiveTab(next))
    view.setAlignmentsVisible = (next) => act(() => setAlignmentsVisible(next))
    view.setSelectedRangePort = (next) => act(() => setSelectedRange(next))
    view.setSelectedAlignmentTraceId = (next) => act(() => setSelectedAlignmentTraceId(next))
    view.selectPrimers = (ids, focused) => act(() => {
      setSelectedPrimerIds(ids)
      setSelectedPrimerId(focused ?? ids[0] ?? null)
    })

    view.controller = usePrimerManagementController(currentRecord, setRecordState, {
      getTraceFiles: () => members,
      getAlignmentsVisible: () => alignmentsVisible,
      getSelectedLibraryMember: () => selectedLibraryMember,
      getSelectedPrimers: () => selectedPrimersForMenuProjection(currentRecord, selectedLibraryMember, { selectedPrimerId, selectedPrimerIds }),
      getPrimerBindings: () => [],
      openUnsavedRecordsInNewTabs: (records) => calls.opened.push(...records),
      setSequenceScrollTarget: (position) => calls.scrollTargets.push(position),
      selectedAlignmentTraceId,
      setSelectedAlignmentTraceId,
      selectedRange,
      selectionFocus,
      cutStrandSelection: null,
      activeTab,
      hybridization,
      context: (next = hybridization) => ({
        record: currentRecord,
        members,
        isLibrary: isDnaLibraryRecord(currentRecord),
        referenceMemberId: null,
        hybridization: next,
      }),
      apply: (result) => {
        setRecordState(result.record)
        setMembers(result.members)
      },
      setStatus: (status) => {
        calls.status.push(status)
      },
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectionFocus,
      setSelectedFeatureId: () => {},
      setSelectedFeatureIds: () => {},
      setCutSelectionAnchor: () => {},
      setCutStrandSelection: () => {},
      setCutSelectionEnzymes: () => {},
      setSelectedRange,
      setSelectionAnchor: () => {},
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
    unmount: () => act(() => root.unmount()),
  }
}

function editorDraft(partial: Partial<PrimerEditorState>): PrimerEditorState {
  return {
    mode: 'create',
    name: 'New primer',
    sequence: 'ACGTACGT',
    color: 'primer-purple',
    description: '',
    phosphorylated: false,
    ...partial,
  }
}

describe('usePrimerManagementController editor and CRUD commands', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('stores and deletes a completed specificity result without closing the primer editor', () => {
    const env = setup(record([primer('p1')]))
    cleanup = env.unmount
    const specificity = {
      primerSequence: 'ACGTACGT', searchedSequence: 'ACGTACGT', completedAt: '2026-11-18T00:00:00Z',
      result: { searchSet: { database: 'refseq_rna' as const, organism: '9606' }, sequenceLength: 8, sites: [], truncated: false, fastSearch: false },
    }
    act(() => env.view.controller.openPrimerEditorForPrimer('p1'))
    act(() => env.view.controller.savePrimerSpecificity(specificity))
    expect(env.view.record.primers[0]?.specificity).toEqual(specificity)
    expect(env.view.controller.primerEditor?.primerId).toBe('p1')
    act(() => env.view.controller.savePrimerSpecificity(undefined))
    expect(env.view.record.primers[0]?.specificity).toBeUndefined()
  })

  it('opens the editor for a main-record or member primer and syncs the member selection', () => {
    const env = setup(libraryRecord([primer('c1', 'Consensus')]), [member('m1', [primer('pm1', 'MemberPrimer')])])
    cleanup = env.unmount

    act(() => env.view.controller.openPrimerEditorForPrimer('pm1', 'm1'))
    expect(env.view.controller.primerEditor).toMatchObject({
      mode: 'edit', primerId: 'pm1', name: 'MemberPrimer',
    })
    expect(env.view.selectedAlignmentTraceId).toBe('m1')

    act(() => env.view.controller.openPrimerEditorForPrimer('c1', null))
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'edit', primerId: 'c1', name: 'Consensus' })
    expect(env.view.selectedAlignmentTraceId).toBeNull()

    act(() => env.view.controller.openPrimerEditorForPrimer('missing'))
    expect(env.view.controller.primerEditor).toMatchObject({ primerId: 'c1' })
  })

  it('resolves the editing member implicitly from the alignment selection only when alignments are hidden', () => {
    const env = setup(libraryRecord([primer('c1', 'Consensus')]), [member('m1', [primer('pm1', 'MemberPrimer')])])
    cleanup = env.unmount

    env.view.setAlignmentsVisible(true)
    env.view.setSelectedAlignmentTraceId('m1')
    act(() => env.view.controller.openPrimerEditorForPrimer('pm1'))
    expect(env.view.controller.primerEditor).toBeNull()

    env.view.setAlignmentsVisible(false)
    act(() => env.view.controller.openPrimerEditorForPrimer('pm1'))
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'edit', primerId: 'pm1', name: 'MemberPrimer' })
    expect(env.view.selectedAlignmentTraceId).toBe('m1')

    act(() => env.view.controller.openPrimerEditorForPrimer('c1'))
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'edit', primerId: 'pm1' })
  })

  it('names new primers from strand and existing count, with range and length guards', () => {
    const env = setup(record([primer('p1'), primer('p2')]))
    cleanup = env.unmount

    act(() => env.view.controller.openAddPrimerFromMenu())
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'create', name: 'Primer 3', sequence: '' })
    act(() => env.view.controller.setPrimerEditor(null))

    env.view.setSelectedRangePort({ start: 4, end: 12 })
    act(() => env.view.controller.openAddPrimerFromMenu())
    expect(env.view.controller.primerEditor).toBeNull()
    expect(env.view.controller.primerOrientationOpen).toBe(true)

    act(() => env.view.controller.openPrimerEditorFromSelection('forward'))
    expect(env.view.controller.primerOrientationOpen).toBe(false)
    expect(env.view.controller.primerEditor).toMatchObject({
      mode: 'create', name: 'Forward primer 3', sequence: 'ACGTACGT', strand: 'forward', annealedLength: 8,
    })

    act(() => env.view.controller.openPrimerEditorFromSelection('reverse'))
    expect(env.view.controller.primerEditor).toMatchObject({
      name: 'Reverse primer 3', sequence: reverseComplement('ACGTACGT'), strand: 'reverse',
    })
  })

  it('rejects editor creation without a range and oversized ranges with the length status', () => {
    const longRecord = record([], { sequence: 'ACGT'.repeat(100) } as Partial<SequenceRecord>)
    const env = setup(longRecord)
    cleanup = env.unmount

    act(() => env.view.controller.openPrimerEditorFromSelection('forward'))
    expect(env.calls.status).toEqual(['Select a sequence range before creating a primer.'])
    expect(env.view.controller.primerEditor).toBeNull()

    env.view.setSelectedRangePort({ start: 0, end: 250 })
    act(() => env.view.controller.openAddPrimerFromMenu())
    expect(env.calls.status[1]).toContain('Primers can contain at most 200 bases')
    expect(env.calls.status[1]).toContain('Actions → PCR')
    expect(env.view.controller.primerOrientationOpen).toBe(false)
  })

  it('opens the editor for the selected primer or reports the empty selection', () => {
    const env = setup(record([primer('p1', 'First')]))
    cleanup = env.unmount

    act(() => env.view.controller.openEditSelectedPrimers())
    expect(env.calls.status).toEqual(['Select a primer to edit.'])

    env.view.selectPrimers(['p1'])
    act(() => env.view.controller.openEditSelectedPrimers())
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'edit', primerId: 'p1', name: 'First' })
  })

  it('inspects a history oligo as a normalized create-mode draft', () => {
    const env = setup(record([]))
    cleanup = env.unmount

    act(() => env.view.controller.inspectHistoryOligo({ name: 'oligo 1', sequence: 'acgt acgt', description: 'from history' }))
    expect(env.view.controller.primerEditor).toMatchObject({
      mode: 'create', name: 'oligo 1', sequence: 'ACGTACGT', description: 'from history', annealedLength: 8,
    })
  })

  it('duplicates the selection and moves selection and focus to the copies', () => {
    const env = setup(record([primer('p1'), primer('p2')]))
    cleanup = env.unmount

    env.view.selectPrimers(['p1'])
    act(() => env.view.controller.duplicateSelectedPrimers())

    expect(env.view.record.primers).toHaveLength(3)
    const added = env.view.record.primers[2]!
    expect(env.calls.status).toEqual([`Duplicated primer ${added.name}.`])
    expect(env.view.selectedPrimerIds).toEqual([added.id])
    expect(env.view.selectedPrimerId).toBe(added.id)
    expect(env.view.selectionFocus).toBe('primer')
  })

  it('removes the selection, clears it, and returns focus to dna', () => {
    const env = setup(record([primer('p1'), primer('p2')]))
    cleanup = env.unmount

    act(() => env.view.controller.removeSelectedPrimers())
    expect(env.calls.status).toEqual(['Select a primer to remove.'])

    env.view.selectPrimers(['p1', 'p2'])
    act(() => env.view.controller.removeSelectedPrimers())
    expect(env.view.record.primers).toEqual([])
    expect(env.calls.status[1]).toBe('Deleted 2 primers.')
    expect(env.view.selectedPrimerIds).toEqual([])
    expect(env.view.selectedPrimerId).toBeNull()
    expect(env.view.selectionFocus).toBe('dna')
  })

  it('targets the selected library member when the Primers tab makes it the editing target', () => {
    const env = setup(libraryRecord([primer('c1')]), [member('m1', [primer('pm1', 'member primer')])])
    cleanup = env.unmount

    env.view.setActiveTab('Primers')
    env.view.setSelectedAlignmentTraceId('m1')
    env.view.setSelectedLibraryMember(env.view.members[0]!)
    env.view.selectPrimers(['pm1'])
    act(() => env.view.controller.removeSelectedPrimers())

    expect(env.view.record.primers.map((p) => p.id)).toEqual(['c1'])
    expect(env.view.members[0]!.primers ?? []).toEqual([])
    expect(env.calls.status).toEqual(['Deleted primer member primer.'])

    const fresh = member('m1', [primer('pm2', 'second')])
    env.view.setMembers([fresh])
    env.view.setSelectedLibraryMember(fresh)
    env.view.selectPrimers(['pm2'])
    act(() => env.view.controller.duplicateSelectedPrimers())

    expect(env.view.record.primers.map((p) => p.id)).toEqual(['c1'])
    expect(env.view.members[0]!.primers.map((p) => p.name)).toEqual(['second', 'second copy'])
    expect(env.calls.status[1]).toBe('Duplicated primer second copy.')
    expect(env.view.selectedPrimerIds).toHaveLength(1)
  })

  it('applies a color across a multi-primer selection and closes the picker', () => {
    const env = setup(record([primer('p1'), primer('p2'), primer('p3')]))
    cleanup = env.unmount

    act(() => env.view.controller.openPrimerColorPicker())
    expect(env.calls.status).toEqual(['Select a primer to change its color.'])
    expect(env.view.controller.primerColorPickerOpen).toBe(false)

    env.view.selectPrimers(['p1', 'p2'])
    act(() => env.view.controller.openPrimerColorPicker())
    expect(env.view.controller.primerColorPickerOpen).toBe(true)

    act(() => env.view.controller.applyPrimerColor('primer-teal'))
    expect(env.view.record.primers.map((p) => p.color)).toEqual(['primer-teal', 'primer-teal', 'p3'])
    expect(env.calls.status[1]).toBe('Updated color for 2 primers.')
    expect(env.view.controller.primerColorPickerOpen).toBe(false)
  })

  it('saves a new primer, then reveals and selects it after closing the editor', async () => {
    const env = setup(record([primer('p1')]))
    cleanup = env.unmount

    await act(async () => {
      env.view.controller.savePrimerEditor(editorDraft({ name: 'GFP-f', sequence: 'ACGTACGT' }))
    })

    const added = env.view.record.primers[1]!
    expect(env.view.record.primers).toHaveLength(2)
    expect(added.name).toBe('GFP-f')
    expect(env.calls.status[0]).toContain('Added primer GFP-f; Tm ')
    expect(env.view.controller.primerEditor).toBeNull()
    expect(env.view.selectedPrimerIds).toEqual([added.id])
    expect(env.view.selectionFocus).toBe('primer')
    expect(env.calls.scrollTargets).toEqual([null, 0])
  })

  it('rejects duplicate names within the editing scope and keeps the editor open', async () => {
    const env = setup(record([primer('p1', 'GFP-f')]))
    cleanup = env.unmount

    act(() => env.view.controller.openAddPrimerFromMenu())
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'create', name: 'Primer 2' })

    await act(async () => {
      env.view.controller.savePrimerEditor({ ...env.view.controller.primerEditor!, name: 'GFP-f' })
    })
    expect(env.calls.status).toEqual(['A primer named “GFP-f” already exists in this file. Choose a unique name.'])
    expect(env.view.record.primers).toHaveLength(1)
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'create', name: 'Primer 2' })
  })

  it('rejects over-length sequences before any mutation', async () => {
    const env = setup(record([]))
    cleanup = env.unmount

    await act(async () => {
      env.view.controller.savePrimerEditor(editorDraft({ sequence: 'A'.repeat(201) }))
    })
    expect(env.calls.status[0]).toContain('Primers can contain at most 200 bases')
    expect(env.view.record.primers).toEqual([])
  })

  it('preserves complex bindings when an edit keeps the sequence unchanged', async () => {
    const complexBindings: PrimerBindingLayout[] = [{
      strand: 'forward', templateStart: 4, templateEnd: 12,
      components: [
        { primerBases: 'ACGTACGT', templateStart: 4, templateEnd: 12 },
        { primerBases: 'GG' },
      ],
    }]
    const env = setup(record([primer('p1', 'Editable', 'ACGTACGT', { bindings: complexBindings })]))
    cleanup = env.unmount

    act(() => env.view.controller.openPrimerEditorForPrimer('p1'))
    const editor = env.view.controller.primerEditor!
    await act(async () => {
      env.view.controller.savePrimerEditor({ ...editor, description: 'edited' })
    })

    const saved = env.view.record.primers[0]!
    expect(saved.description).toBe('edited')
    expect(saved.bindings).toEqual(complexBindings)
    expect(env.calls.status[0]).toContain('Updated primer Editable; Tm ')
  })

  it('scopes name uniqueness and the save to the targeted library member', async () => {
    const env = setup(libraryRecord([primer('c1', 'taken')]), [member('m1', [primer('pm1', 'member-taken')])])
    cleanup = env.unmount
    env.view.setActiveTab('Primers')
    env.view.setSelectedAlignmentTraceId('m1')

    await act(async () => {
      env.view.controller.savePrimerEditor(editorDraft({ name: 'taken' }))
    })
    expect(env.view.members[0]!.primers.map((p) => p.name)).toEqual(['member-taken', 'taken'])
    expect(env.view.record.primers.map((p) => p.id)).toEqual(['c1'])

    await act(async () => {
      env.view.controller.savePrimerEditor(editorDraft({ name: 'member-taken' }))
    })
    expect(env.calls.status.at(-1)).toBe('A primer named “member-taken” already exists in this file. Choose a unique name.')
    expect(env.view.members[0]!.primers).toHaveLength(2)
  })

  it('opens annealed oligos for a complementary pair, attaching the recipe guide when present', () => {
    const pair = [primer('g1-s', 'g1_sense', SENSE), primer('g1-a', 'g1_antisense', ANTISENSE)]
    const historyNode = recipeNode('h1', ['g1'], [{ name: 'g1_sense', sequence: SENSE, guideId: 'g1' }])
    const env = setup(record(pair, { history: historyNode } as Partial<SequenceRecord>))
    cleanup = env.unmount

    act(() => env.view.controller.openSelectedAnnealedOligos())
    expect(env.calls.status).toEqual(['Select a complementary oligo pair to open as double-stranded DNA.'])

    env.view.selectPrimers(['g1-s', 'g1-a'])
    act(() => env.view.controller.openSelectedAnnealedOligos())
    expect(env.calls.opened).toHaveLength(1)
    const opened = env.calls.opened[0]!
    expect(opened.name).toBe('guide g1 annealed oligos')
    expect(opened.features).toHaveLength(1)
    expect(opened.primers.map((p) => p.name)).toEqual(['g1_sense', 'g1_antisense'])
    expect(env.calls.status[1]).toBe('Opened guide g1 annealed oligos.')
  })

  it('resolves a single selected oligo to its named partner', () => {
    const pair = [primer('g2-s', 'g2_sense', SENSE), primer('g2-a', 'g2_antisense', ANTISENSE)]
    const env = setup(record(pair))
    cleanup = env.unmount

    env.view.selectPrimers(['g2-a'])
    act(() => env.view.controller.openSelectedAnnealedOligos())
    expect(env.calls.opened).toHaveLength(1)
    expect(env.calls.opened[0]!.primers.map((p) => p.name)).toEqual(['g2_sense', 'g2_antisense'])
  })

  it('reports non-duplex inserts and incomplete history guides', () => {
    const env = setup(record([]))
    cleanup = env.unmount

    act(() => env.view.controller.openAnnealedInsert(null))
    expect(env.calls.status).toEqual(['These oligos do not form one double-stranded piece.'])

    const node = recipeNode('h2', ['g2'], [{ name: 'g2_sense', sequence: SENSE, guideId: 'g2' }])
    act(() => env.view.controller.openAnnealedHistoryInsert(node, 'g2'))
    expect(env.calls.status[1]).toBe('This guide does not have both a sense and an antisense oligo.')
    expect(env.calls.opened).toEqual([])
  })

  it('opens a complete history guide as a new annealed-oligo document', () => {
    const node = recipeNode('h3', ['g3'], [
      { name: 'g3_sense', sequence: SENSE, guideId: 'g3' },
      { name: 'g3_antisense', sequence: ANTISENSE, guideId: 'g3' },
    ])
    const env = setup(record([], { history: node } as Partial<SequenceRecord>))
    cleanup = env.unmount

    act(() => env.view.controller.openAnnealedHistoryInsert(node, 'g3'))
    expect(env.calls.opened).toHaveLength(1)
    expect(env.calls.opened[0]!.primers.map((p) => p.name)).toEqual(['g3_sense', 'g3_antisense'])
    expect(env.calls.status).toEqual(['Opened guide g3 annealed oligos.'])
  })

  it('never holds a stale record or member across renders', () => {
    const env = setup(record([primer('p1')]))
    cleanup = env.unmount

    act(() => env.view.controller.openAddPrimerFromMenu())
    expect(env.view.controller.primerEditor).toMatchObject({ name: 'Primer 2' })
    act(() => env.view.controller.setPrimerEditor(null))

    env.view.setRecord(record([primer('p1'), primer('p2'), primer('p3')]))
    act(() => env.view.controller.openAddPrimerFromMenu())
    expect(env.view.controller.primerEditor).toMatchObject({ name: 'Primer 4' })

    const m2 = member('m2', [primer('pm2', 'late member primer')])
    env.view.setMembers([m2])
    env.view.setSelectedLibraryMember(m2)
    env.view.selectPrimers(['pm2'])
    act(() => env.view.controller.openEditSelectedPrimers())
    expect(env.view.controller.primerEditor).toMatchObject({ mode: 'edit', name: 'late member primer' })
    expect(env.view.selectedAlignmentTraceId).toBe('m2')
  })
})
