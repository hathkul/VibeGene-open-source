// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPrimerHybridizationParams, type PrimerHybridizationParams } from '../src/domain/primerHybridization'
import { isDnaLibraryRecord } from '../src/domain/dnaLibrary'
import type { SgRNAAnnotation } from '../src/domain/sgrna'
import type { Primer, SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import { selectedPrimersForMenu as selectedPrimersForMenuProjection } from '../src/application/primerWorkflow/primerPaneProjection'
import type { SelectionRange } from '../src/presentation/sequence'
import { usePrimerManagementController } from '../src/presentation/hooks/usePrimerManagementController'
import { usePrimerImportExportController } from '../src/presentation/hooks/usePrimerImportExportController'

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

function member(id: string, sequence: string, primers: Primer[] = []): TraceFileRecord {
  return {
    id, fileName: `${id}.ab1`, sequence,
    chromatogram: {} as never, enabled: true, expanded: false, showAnnotations: true,
    alignment: null, primers,
  }
}

function sgRna(name: string, spacer: string): SgRNAAnnotation {
  return { id: name, guide: { id: name, name }, spacer } as unknown as SgRNAAnnotation
}

type Management = ReturnType<typeof usePrimerManagementController>
type ImportExport = ReturnType<typeof usePrimerImportExportController>

function setup(initialRecord: SequenceRecord, initialMembers: TraceFileRecord[] = []) {
  const calls = {
    status: [] as string[],
    downloads: [] as { fileName: string; contents: string; mimeType: string }[],
    order: [] as string[],
  }
  const storage = {
    fileText: '',
    readError: null as Error | null,
  }
  const view = {
    importExport: null as unknown as ImportExport,
    management: null as unknown as Management,
    record: initialRecord,
    sgRnas: [] as SgRNAAnnotation[],
    selectedPrimerId: null as string | null,
    selectedPrimerIds: [] as string[],
    selectionFocus: 'dna' as string,
    setRecord: null as unknown as (next: SequenceRecord) => void,
    selectPrimers: null as unknown as (ids: string[], focused?: string | null) => void,
    setSelectedRangePort: null as unknown as (next: SelectionRange | null) => void,
  }

  function Harness() {
    const [currentRecord, setRecordState] = useState(initialRecord)
    const [members, setMembers] = useState(initialMembers)
    const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
    const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
    const [selectionFocus, setSelectionFocus] = useState<'dna' | 'feature' | 'primer' | 'bond'>('dna')
    const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)

    view.record = currentRecord
    view.selectedPrimerId = selectedPrimerId
    view.selectedPrimerIds = selectedPrimerIds
    view.selectionFocus = selectionFocus
    view.setRecord = (next) => act(() => setRecordState(next))
    view.selectPrimers = (ids, focused) => act(() => {
      setSelectedPrimerIds(ids)
      setSelectedPrimerId(focused ?? ids[0] ?? null)
    })
    view.setSelectedRangePort = (next) => act(() => setSelectedRange(next))

    const context = (next: PrimerHybridizationParams = hybridization) => ({
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
      hybridization,
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

    view.importExport = usePrimerImportExportController(currentRecord, {
      getTraceFiles: () => members,
      getSelectedPrimers: () => selectedPrimersForMenuProjection(currentRecord, null, { selectedPrimerId, selectedPrimerIds }),
      getSelectedSgRnas: () => view.sgRnas,
      hybridization,
      selectedRange,
      setPrimerImportDialog: (state) => {
        if (state === null) calls.order.push('closeDialog')
        management.setPrimerImportDialog(state)
      },
      setPickPrimersRange: (range) => {
        if (range === null) calls.order.push('closePicker')
        management.setPickPrimersRange(range)
      },
      context,
      apply: (result) => {
        calls.order.push('apply')
        apply(result)
      },
      setStatus,
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectionFocus: (focus) => {
        calls.order.push('select')
        setSelectionFocus(focus)
      },
      download: (fileName, contents, mimeType) => {
        calls.downloads.push({ fileName, contents, mimeType })
      },
      readFileText: async () => {
        if (storage.readError) throw storage.readError
        return storage.fileText
      },
      importPrimerListCommand: management.importPrimerListCommand,
      addImportedPrimerCommand: management.addImportedPrimerCommand,
      addPickedPrimerCommand: management.addPickedPrimerCommand,
      exportPrimerCommand: management.exportPrimerCommand,
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

describe('usePrimerImportExportController', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('opens the import dialog with hybridizing candidates from a primer list file', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.fileText = 'DB-F\tACGTACGT\noff-target\tTTTTTTTT\n'

    await act(async () => { await env.view.importExport.importPrimersFromListFile({} as File) })
    expect(env.view.management.primerImportDialog).toMatchObject({ skipped: 1 })
    expect(env.view.management.primerImportDialog!.candidates).toHaveLength(1)
    expect(env.view.management.primerImportDialog!.candidates[0]!.primer.name).toBe('DB-F')
    expect(env.calls.status).toEqual(['Found 1 hybridizing primer(s); 1 skipped.'])
  })

  it('reports list files with no parsable primers and files where nothing hybridizes', async () => {
    const env = setup(record([]))
    cleanup = env.unmount

    env.storage.fileText = '# just a comment\n\n'
    await act(async () => { await env.view.importExport.importPrimersFromListFile({} as File) })
    expect(env.calls.status.at(-1)).toBe('No primers found in that list (expected name\\tsequence lines).')
    expect(env.view.management.primerImportDialog).toBeNull()

    env.storage.fileText = 'off\tTTTTTTTT\n'
    await act(async () => { await env.view.importExport.importPrimersFromListFile({} as File) })
    expect(env.calls.status.at(-1)).toBe('None of 1 primer(s) hybridized under the current hybridization parameters.')
    expect(env.view.management.primerImportDialog).toBeNull()
  })

  it('surfaces a file-read failure as an import error status', async () => {
    const env = setup(record([]))
    cleanup = env.unmount
    env.storage.readError = new Error('boom')

    await act(async () => { await env.view.importExport.importPrimersFromListFile({} as File) })
    expect(env.calls.status).toEqual(['Could not import primers: boom'])
    expect(env.view.management.primerImportDialog).toBeNull()
  })

  it('lets library member sequences and primers contribute to import planning', async () => {
    const env = setup(
      libraryRecord([]),
      [member('m1', 'CCCCGGGGAAAATTTT', [primer('pm1', 'member primer', 'CCCC')])],
    )
    cleanup = env.unmount
    env.storage.fileText = 'MemberOnly\tGGGGAAAA\n'

    await act(async () => { await env.view.importExport.importPrimersFromListFile({} as File) })
    expect(env.view.management.primerImportDialog!.candidates).toHaveLength(1)
    expect(env.calls.status.at(-1)).toBe('Found 1 hybridizing primer(s).')

    expect(env.view.importExport.libraryPrimerImportOptions()).toMatchObject({
      additionalTemplates: ['CCCCGGGGAAAATTTT'],
    })
    expect(env.view.importExport.libraryPrimerImportOptions()!.additionalExistingPrimers.map((p) => p.id)).toEqual(['pm1'])
  })

  it('returns no import options for a plain construct', () => {
    const env = setup(record([]))
    cleanup = env.unmount
    expect(env.view.importExport.libraryPrimerImportOptions()).toBeUndefined()
  })

  it('applies imported primers, selects them, closes the dialog, and notes dropped primers', () => {
    const env = setup(record([primer('old', 'Old', 'TTTTTTTT')]))
    cleanup = env.unmount
    act(() => env.view.management.setPrimerImportDialog({ candidates: [], skipped: 0 }))

    act(() => env.view.importExport.addImportedPrimers([primer('new1', 'New', 'ACGTACGT')]))
    expect(env.view.record.primers.map((p) => p.name)).toEqual(['New'])
    expect(env.view.selectedPrimerId).toBe('new1')
    expect(env.view.selectedPrimerIds).toEqual(['new1'])
    expect(env.view.selectionFocus).toBe('primer')
    expect(env.view.management.primerImportDialog).toBeNull()
    expect(env.calls.order).toEqual(['apply', 'select', 'closeDialog'])
    expect(env.calls.status.at(-1)).toBe('Imported primer New. Removed 1 previously stored primer that do not hybridize.')
  })

  it('closes the dialog without a status when the import confirm is empty', () => {
    const env = setup(record([]))
    cleanup = env.unmount
    act(() => env.view.management.setPrimerImportDialog({ candidates: [], skipped: 0 }))

    act(() => env.view.importExport.addImportedPrimers([]))
    expect(env.view.management.primerImportDialog).toBeNull()
    expect(env.calls.status).toEqual([])
  })

  it('exports the selected primers and guards the empty selection', () => {
    const env = setup(record([primer('p1', 'T7-F', 'ACGTACGT'), primer('p2', 'T7-R', 'TACGTACG')], { name: 'my construct.dna' } as Partial<SequenceRecord>))
    cleanup = env.unmount

    act(() => env.view.importExport.exportSelectedPrimers())
    expect(env.calls.status).toEqual(['Select a primer to export.'])
    expect(env.calls.downloads).toEqual([])

    env.view.selectPrimers(['p1'])
    act(() => env.view.importExport.exportSelectedPrimers())
    expect(env.calls.downloads).toHaveLength(1)
    expect(env.calls.downloads[0]!.fileName).toBe('Primers from my construct.txt')
    expect(env.calls.downloads[0]!.mimeType).toBe('text/plain')
    expect(env.calls.downloads[0]!.contents).toContain('T7-F')
    expect(env.calls.downloads[0]!.contents).toContain('ACGTACGT')
    expect(env.calls.status.at(-1)).toBe('Exported primer T7-F.')

    env.view.selectPrimers(['p1', 'p2'])
    act(() => env.view.importExport.exportSelectedPrimers())
    expect(env.calls.downloads).toHaveLength(2)
    expect(env.calls.status.at(-1)).toBe('Exported 2 primers.')
  })

  it('exports the selected sgRNAs distinctly from oligo primers and guards the empty selection', () => {
    const env = setup(record([], { name: 'my construct.dna' } as Partial<SequenceRecord>))
    cleanup = env.unmount

    act(() => env.view.importExport.exportSelectedSgRnas())
    expect(env.calls.status).toEqual(['Select an sgRNA to export.'])
    expect(env.calls.downloads).toEqual([])

    env.view.sgRnas = [sgRna('g1', 'GACCACCATGTCAACGTTGG')]
    act(() => env.view.importExport.exportSelectedSgRnas())
    expect(env.calls.downloads).toEqual([{
      fileName: 'sgRNAs from my construct.txt',
      contents: 'g1\tGACCACCATGTCAACGTTGG',
      mimeType: 'text/plain',
    }])
    expect(env.calls.status.at(-1)).toBe('Exported sgRNA g1.')

    env.view.sgRnas = [sgRna('g1', 'GACCACCATGTCAACGTTGG'), sgRna('g2', 'ACGTACGTACGTACGTACGT')]
    act(() => env.view.importExport.exportSelectedSgRnas())
    expect(env.calls.status.at(-1)).toBe('Exported 2 sgRNAs.')
  })

  it('opens pick-primers only for a non-collapsed range', () => {
    const env = setup(record([]))
    cleanup = env.unmount

    act(() => env.view.importExport.openPickPrimers())
    expect(env.calls.status).toEqual(['Select a DNA stretch to pick primers from.'])
    expect(env.view.management.pickPrimersRange).toBeNull()

    env.view.setSelectedRangePort({ start: 4, end: 4 })
    act(() => env.view.importExport.openPickPrimers())
    expect(env.view.management.pickPrimersRange).toBeNull()

    env.view.setSelectedRangePort({ start: 4, end: 12 })
    act(() => env.view.importExport.openPickPrimers())
    expect(env.view.management.pickPrimersRange).toEqual({ start: 4, end: 12 })
  })

  it('adds picked primers, selects them, closes the picker, and keeps existing primers', () => {
    const env = setup(record([primer('old', 'Old', 'TTTTTTTT')]))
    cleanup = env.unmount
    env.view.setSelectedRangePort({ start: 4, end: 12 })
    act(() => env.view.importExport.openPickPrimers())

    act(() => env.view.importExport.addPickedPrimers([primer('k1', 'Picked', 'ACGTACGT')]))
    expect(env.view.record.primers.map((p) => p.name)).toEqual(['Old', 'Picked'])
    expect(env.view.selectedPrimerIds).toEqual(['k1'])
    expect(env.view.selectionFocus).toBe('primer')
    expect(env.view.management.pickPrimersRange).toBeNull()
    expect(env.calls.order).toEqual(['closePicker', 'apply', 'select'])
    expect(env.calls.status.at(-1)).toBe('Added picked primer Picked.')
  })

  it('closes the picker without a status or record change when the pick confirm is empty', () => {
    const env = setup(record([primer('p1', 'T7-F', 'ACGTACGT')]))
    cleanup = env.unmount
    env.view.setSelectedRangePort({ start: 4, end: 12 })
    act(() => env.view.importExport.openPickPrimers())
    expect(env.view.management.pickPrimersRange).toEqual({ start: 4, end: 12 })

    act(() => env.view.importExport.addPickedPrimers([]))
    expect(env.view.management.pickPrimersRange).toBeNull()
    expect(env.calls.order).toEqual(['closePicker'])
    expect(env.calls.status).toEqual([])
    expect(env.view.record.primers.map((p) => p.id)).toEqual(['p1'])
  })

  it('reports picked primers skipped as already present or not binding', () => {
    const env = setup(record([primer('p1', 'T7-F', 'ACGTACGT')]))
    cleanup = env.unmount

    act(() => env.view.importExport.addPickedPrimers([primer('k1', 'Dup', 'ACGTACGT')]))
    expect(env.view.record.primers).toHaveLength(1)
    expect(env.calls.status.at(-1)).toBe(
      'Added 0 picked primers. Skipped 1 already present or not binding under the current hybridization parameters.',
    )
  })

  it('reads the latest record after the document changes', async () => {
    const env = setup(record([]))
    cleanup = env.unmount

    env.view.setRecord(record([], { name: 'other.dna', sequence: 'GGGGGGGGGGGGGGGGGGGGGGGG' } as Partial<SequenceRecord>))
    env.storage.fileText = 'DB-F\tACGTACGT\n'
    await act(async () => { await env.view.importExport.importPrimersFromListFile({} as File) })
    expect(env.calls.status.at(-1)).toBe('None of 1 primer(s) hybridized under the current hybridization parameters.')

    env.view.sgRnas = [sgRna('g1', 'GACCACCATGTCAACGTTGG')]
    act(() => env.view.importExport.exportSelectedSgRnas())
    expect(env.calls.downloads.at(-1)!.fileName).toBe('sgRNAs from other.txt')
  })
})
