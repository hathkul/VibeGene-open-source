// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { createSgRNAFeatures, findSgRNATargets, groupSgRNAFeatures, SGRNA_PRESETS } from '../../domain/sgrna'
import { previewCrisprJunction } from '../../application/selectionEditing/crisprJunction'
import type { SequenceRecord } from '../../domain/types'
import { useCrisprFeatureController } from './useCrisprFeatureController'

const spacers = ['ACGTACGTACGTACGTACGA', 'GCTAGCTAGCTAGCTAGCTA']
function makeRecord(topology: 'linear' | 'circular' = 'linear'): SequenceRecord {
  const sequence = `TTT${spacers[0]}AGG${'T'.repeat(8)}${spacers[1]}TGGAAAA`
  const features = spacers.flatMap((spacer, index) => createSgRNAFeatures(
    findSgRNATargets(sequence, spacer, topology, SGRNA_PRESETS[0]!)[0]!,
    { id: `guide-${index}`, name: `Guide ${index}`, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer },
  ))
  return { ...cloneFixture(), sequence, topology, features, primers: [] }
}

describe('useCrisprFeatureController excision ownership', () => {
  afterEach(() => document.body.replaceChildren())

  it('applies the previewed Cas12a junction and rejects invalid fill settings', async () => {
    const sequence = `CCCTTTA${spacers[0]}AAAAAACCCCCCCCCCTTTA${spacers[1]}AAAAAACCCCC`
    const features = spacers.flatMap((spacer, index) => createSgRNAFeatures(
      findSgRNATargets(sequence, spacer, 'linear', SGRNA_PRESETS[2]!)[0]!,
      { id: `g${index}`, name: `Guide ${index}`, nuclease: 'Cas12a', pamMotif: 'TTTV', pamSide: '5prime', spacer },
    ))
    const record = { ...cloneFixture(), sequence, topology: 'linear' as const, features, primers: [] }
    let controller: ReturnType<typeof useCrisprFeatureController> | undefined
    let applyUpdater: ((current: SequenceRecord) => SequenceRecord) | undefined
    const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord) => { applyUpdater = updater })
    const setStatus = vi.fn()
    const setSequenceRange = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      controller = useCrisprFeatureController({
        record, traceFiles: [], alignmentsVisible: false, selectedAlignmentTraceId: null,
        selectedRange: null, cutStrandSelection: null, selectedSgRnasForCloning: [],
        selectedSgRnasForExport: groupSgRNAFeatures(record.features), featureTabSelectionMemberId: null,
        selectedLibraryMemberId: null, updateRecord, onTraceFilesChange: vi.fn(), pushDocumentHistorySnapshot: vi.fn(),
        setSelectedAlignmentTraceId: vi.fn(), setSelectedFeatureId: vi.fn(), setSelectedFeatureIds: vi.fn(),
        setSelectionFocus: vi.fn(), setStatus, requestDocumentExit: vi.fn(), commitUnsavedDownloadedRecord: vi.fn(),
        traceDocument: false, getCurrentRecord: () => record, setSequenceRange,
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    act(() => controller?.openCrisprExcision())
    const plan = controller!.crisprExcision!.plan
    const settings = { arc: 'between' as const, sites: plan.sites, leftFill: 5, rightFill: 5 }
    const preview = previewCrisprJunction(record, plan, settings).preview!
    act(() => controller?.exciseCrisprRegion('between', { ...settings, rightFill: 20 }))
    expect(updateRecord).not.toHaveBeenCalled()
    act(() => controller?.exciseCrisprRegion('between', settings))
    expect(applyUpdater?.(record).sequence).toBe(preview.sequence)
    expect(setSequenceRange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sequenceLength: preview.sequence.length }))
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('simulated CRISPR'))
    act(() => root.unmount())
  })

  it('cancels stale targets without mutating the current record', async () => {
    const initial = makeRecord()
    let current = initial
    let controller: ReturnType<typeof useCrisprFeatureController> | undefined
    const updateRecord = vi.fn()
    const setStatus = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      controller = useCrisprFeatureController({
        record: initial, traceFiles: [], alignmentsVisible: false, selectedAlignmentTraceId: null,
        selectedRange: null, cutStrandSelection: null, selectedSgRnasForCloning: [],
        selectedSgRnasForExport: groupSgRNAFeatures(initial.features), featureTabSelectionMemberId: null,
        selectedLibraryMemberId: null, updateRecord, onTraceFilesChange: vi.fn(), pushDocumentHistorySnapshot: vi.fn(),
        setSelectedAlignmentTraceId: vi.fn(), setSelectedFeatureId: vi.fn(), setSelectedFeatureIds: vi.fn(),
        setSelectionFocus: vi.fn(), setStatus, requestDocumentExit: vi.fn(), commitUnsavedDownloadedRecord: vi.fn(),
        traceDocument: false, getCurrentRecord: () => current, setSequenceRange: vi.fn(),
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    act(() => controller?.openCrisprExcision())
    current = { ...current, sequence: `A${current.sequence.slice(1)}` }
    act(() => controller?.exciseCrisprRegion('between'))
    expect(updateRecord).not.toHaveBeenCalled()
    expect(setStatus).toHaveBeenCalledWith('The selected sgRNA targets have changed; select them again to excise a region.')
    expect(controller?.crisprExcision).toBeNull()
    act(() => root.unmount())
  })

  it('applies a valid excision and updates selection and status', async () => {
    const record = makeRecord()
    let controller: ReturnType<typeof useCrisprFeatureController> | undefined
    let applyUpdater: ((current: SequenceRecord) => SequenceRecord) | undefined
    const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord) => { applyUpdater = updater })
    const setSequenceRange = vi.fn()
    const setStatus = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      controller = useCrisprFeatureController({
        record, traceFiles: [], alignmentsVisible: false, selectedAlignmentTraceId: null,
        selectedRange: null, cutStrandSelection: null, selectedSgRnasForCloning: [],
        selectedSgRnasForExport: groupSgRNAFeatures(record.features), featureTabSelectionMemberId: null,
        selectedLibraryMemberId: null, updateRecord, onTraceFilesChange: vi.fn(), pushDocumentHistorySnapshot: vi.fn(),
        setSelectedAlignmentTraceId: vi.fn(), setSelectedFeatureId: vi.fn(), setSelectedFeatureIds: vi.fn(),
        setSelectionFocus: vi.fn(), setStatus, requestDocumentExit: vi.fn(), commitUnsavedDownloadedRecord: vi.fn(),
        traceDocument: false, getCurrentRecord: () => record, setSequenceRange,
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    act(() => controller?.openCrisprExcision())
    act(() => controller?.exciseCrisprRegion('between'))
    expect(updateRecord).toHaveBeenCalledOnce()
    expect(applyUpdater?.(record).sequence).toBe(record.sequence.slice(0, 20) + record.sequence.slice(51))
    expect(setSequenceRange).toHaveBeenCalledWith({ start: 20, end: 20 }, { collapsed: true, sequenceLength: record.sequence.length - 31 })
    expect(setStatus).toHaveBeenCalledWith('Excised 31 bp between nominal CRISPR cut sites.')
    act(() => root.unmount())
  })

  it('collapses across-origin excision selection at zero for a circular record', async () => {
    const record = makeRecord('circular')
    let controller: ReturnType<typeof useCrisprFeatureController> | undefined
    let applyUpdater: ((current: SequenceRecord) => SequenceRecord) | undefined
    const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord) => { applyUpdater = updater })
    const setSequenceRange = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      controller = useCrisprFeatureController({
        record, traceFiles: [], alignmentsVisible: false, selectedAlignmentTraceId: null,
        selectedRange: null, cutStrandSelection: null, selectedSgRnasForCloning: [],
        selectedSgRnasForExport: groupSgRNAFeatures(record.features), featureTabSelectionMemberId: null,
        selectedLibraryMemberId: null, updateRecord, onTraceFilesChange: vi.fn(), pushDocumentHistorySnapshot: vi.fn(),
        setSelectedAlignmentTraceId: vi.fn(), setSelectedFeatureId: vi.fn(), setSelectedFeatureIds: vi.fn(),
        setSelectionFocus: vi.fn(), setStatus: vi.fn(), requestDocumentExit: vi.fn(), commitUnsavedDownloadedRecord: vi.fn(),
        traceDocument: false, getCurrentRecord: () => record, setSequenceRange,
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    act(() => controller?.openCrisprExcision())
    act(() => controller?.exciseCrisprRegion('across-origin'))
    expect(applyUpdater?.(record).sequence).toBe(record.sequence.slice(20, 51))
    expect(setSequenceRange).toHaveBeenCalledWith({ start: 0, end: 0 }, { collapsed: true, sequenceLength: 31 })
    act(() => root.unmount())
  })
})
