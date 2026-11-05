// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import { cloneFixture, labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { useFeatureEditorController, type FeatureEditorControllerOptions } from './useFeatureEditorController'

function selectedFeature(id: string): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: labPlasmid.features[0]!.color,
    locations: [{ start: 0, end: 4, strand: 'forward' }],
  }
}

function baseOptions(overrides: Partial<FeatureEditorControllerOptions> = {}): FeatureEditorControllerOptions {
  return {
    record: labPlasmid,
    getCurrentRecord: () => labPlasmid,
    traceFiles: [],
    activeTab: 'Features',
    alignmentsVisible: true,
    selectedAlignmentTraceId: null,
    featureTabSelectionMemberId: null,
    selectedRange: null,
    selectionFocus: 'feature',
    selectedPrimerIds: [],
    facingPrimerAmpliconRange: vi.fn(() => null),
    cutStrandSelection: null,
    selectedFeatureId: null,
    selectedFeature: null,
    selectedFeatureIds: [],
    selectableAnnotations: [],
    featureSelectionMember: null,
    selectedAnnotation: null,
    pendingFeatureMergeIds: null,
    setPendingFeatureMergeIds: vi.fn(),
    setFeatureEditor: vi.fn(),
    setProteinFeatureEditor: vi.fn(),
    setSelectedAlignmentTraceId: vi.fn(),
    setSelectedFeatureId: vi.fn(),
    setSelectedFeatureIds: vi.fn(),
    setFeatureTabSelectionMemberId: vi.fn(),
    setFeatureTabAnchor: vi.fn(),
    setSelectionFocus: vi.fn(),
    setSelectedRange: vi.fn(),
    setSequenceRange: vi.fn(),
    setTraceAlignBusy: vi.fn(),
    selectFeatureById: vi.fn(),
    openSgRnaEditor: vi.fn(),
    libraryFolderId: null,
    openRecordInNewTab: vi.fn(),
    updateRecord: vi.fn(),
    onTraceFilesChange: vi.fn(),
    pushDocumentHistorySnapshot: vi.fn(),
    setStatus: vi.fn(),
    geneticCode: 'standard',
    ...overrides,
  }
}

describe('useFeatureEditorController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('uses the full paired-primer amplicon for Add Feature, but not a stale primer range', () => {
    const setFeatureEditor = vi.fn()
    const facingPrimerAmpliconRange = vi.fn(() => ({ start: 12, end: 88 }))
    let controller!: ReturnType<typeof useFeatureEditorController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureEditorController(baseOptions({
        record: { ...labPlasmid, topology: 'linear', sequence: 'A'.repeat(120) },
        selectedRange: { start: 12, end: 88 },
        selectionFocus: 'primer',
        selectedPrimerIds: ['forward', 'reverse'],
        facingPrimerAmpliconRange,
        setFeatureEditor,
      }))
      return null
    }
    act(() => root.render(<Harness />))

    act(() => controller.addFeature())
    expect(setFeatureEditor).toHaveBeenLastCalledWith(expect.objectContaining({
      segments: [expect.objectContaining({ start: 12, end: 88 })],
    }))

    facingPrimerAmpliconRange.mockReturnValue({ start: 20, end: 70 })
    act(() => controller.addFeature())
    expect(setFeatureEditor).toHaveBeenLastCalledWith(expect.objectContaining({
      segments: [expect.objectContaining({ start: 10, end: 40 })],
    }))
  })

  it('openFeatureColorEditor reports missing selection with the expected status', () => {
    const setStatus = vi.fn()
    let controller!: ReturnType<typeof useFeatureEditorController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureEditorController(baseOptions({ setStatus, selectedFeature: null }))
      return null
    }
    act(() => root.render(<Harness />))
    act(() => controller.openFeatureColorEditor())
    expect(setStatus).toHaveBeenCalledWith('Select a feature to change its color.')
  })

  it('openFeatureColorEditor opens the feature editor for the selected feature', () => {
    const setFeatureEditor = vi.fn()
    const selectFeatureById = vi.fn()
    const colorFeature = selectedFeature('color-me')
    let controller!: ReturnType<typeof useFeatureEditorController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureEditorController(baseOptions({
        record: { ...labPlasmid, features: [colorFeature] },
        selectedFeature: colorFeature,
        setFeatureEditor,
        selectFeatureById,
      }))
      return null
    }
    act(() => root.render(<Harness />))
    act(() => controller.openFeatureColorEditor())
    expect(selectFeatureById).toHaveBeenCalledWith('color-me', false, false, expect.objectContaining({ scroll: undefined }))
    expect(setFeatureEditor).toHaveBeenCalled()
  })

  it('editProteinSequenceFeature opens the editor with scroll false', () => {
    const selectFeatureById = vi.fn()
    const setProteinFeatureEditor = vi.fn()
    const colorFeature = selectedFeature('feature-protein')
    let controller!: ReturnType<typeof useFeatureEditorController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureEditorController(baseOptions({
        record: { ...labPlasmid, molecule: 'protein', features: [colorFeature] },
        selectFeatureById,
        setProteinFeatureEditor,
      }))
      return null
    }
    act(() => root.render(<Harness />))
    act(() => controller.editProteinSequenceFeature('feature-protein'))
    expect(selectFeatureById).toHaveBeenCalledWith('feature-protein', false, false, { scroll: false, libraryMemberId: null })
    expect(setProteinFeatureEditor).toHaveBeenCalled()
  })

  it('editDnaSequenceFeature applies scroll false and member-key spread semantics', () => {
    const selectFeatureById = vi.fn()
    const colorFeature = selectedFeature('feature-dna')
    let controller!: ReturnType<typeof useFeatureEditorController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureEditorController(baseOptions({
        record: { ...labPlasmid, features: [colorFeature] },
        selectFeatureById,
      }))
      return null
    }
    act(() => root.render(<Harness />))
    act(() => controller.editDnaSequenceFeature('feature-dna'))
    expect(selectFeatureById).toHaveBeenCalledWith('feature-dna', false, false, { scroll: false, libraryMemberId: null })
    selectFeatureById.mockClear()
    act(() => controller.editDnaSequenceFeature('feature-dna', null))
    expect(selectFeatureById).toHaveBeenCalledWith('feature-dna', false, false, { scroll: false, libraryMemberId: null })
    act(() => controller.editDnaSequenceFeature('feature-dna', 'member-2'))
    expect(selectFeatureById).toHaveBeenCalledWith('feature-dna', false, false, { scroll: false, libraryMemberId: 'member-2' })
  })

  it('editDnaSequenceFeature distinguishes omitted member key from explicit null on DNA libraries', () => {
    const fixtureFeatureColor = labPlasmid.features[0]!.color
    const memberFeature: SequenceFeature = {
      id: 'member-feature',
      name: 'member-feature',
      type: 'CDS',
      color: fixtureFeatureColor,
      locations: [{ start: 0, end: 8, strand: 'forward' }],
    }
    const consensusFeature: SequenceFeature = {
      id: 'consensus-feature',
      name: 'consensus-feature',
      type: 'CDS',
      color: fixtureFeatureColor,
      locations: [{ start: 4, end: 12, strand: 'forward' }],
    }
    const libraryRecord: SequenceRecord = normalizeSequenceRecord({
      ...cloneFixture(),
      id: 'library',
      name: 'library',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT',
      features: [consensusFeature],
      primers: [],
      dna: { documentRole: 'library' },
    })
    const traceFiles: TraceFileRecord[] = [{
      ...traceRecordFromSequence(libraryRecord.sequence, 'member-1.ab1', { id: 'member-1' }),
      features: [memberFeature],
    }]
    const setSelectedAlignmentTraceId = vi.fn()
    const setFeatureEditor = vi.fn()
    const setStatus = vi.fn()
    const selectFeatureById = vi.fn()
    let controller!: ReturnType<typeof useFeatureEditorController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureEditorController(baseOptions({
        record: libraryRecord,
        traceFiles,
        activeTab: 'Features',
        alignmentsVisible: false,
        selectedAlignmentTraceId: 'member-1',
        selectableAnnotations: [memberFeature, consensusFeature],
        setSelectedAlignmentTraceId,
        setFeatureEditor,
        setStatus,
        selectFeatureById,
      }))
      return null
    }
    act(() => root.render(<Harness />))

    act(() => controller.editDnaSequenceFeature('member-feature'))
    expect(setSelectedAlignmentTraceId).not.toHaveBeenCalled()
    expect(selectFeatureById).toHaveBeenCalledWith('member-feature', false, false, { scroll: false, libraryMemberId: 'member-1' })
    expect(setFeatureEditor).toHaveBeenCalledWith(expect.objectContaining({ libraryMemberId: 'member-1' }))
    expect(setStatus).not.toHaveBeenCalledWith('Only stored features can be edited in Feature Properties.')

    setSelectedAlignmentTraceId.mockClear()
    setFeatureEditor.mockClear()
    selectFeatureById.mockClear()
    act(() => controller.editDnaSequenceFeature('member-feature', null))
    expect(setSelectedAlignmentTraceId).not.toHaveBeenCalled()
    expect(selectFeatureById).not.toHaveBeenCalled()
    expect(setFeatureEditor).not.toHaveBeenCalled()
    expect(setStatus).toHaveBeenCalledWith('Only stored features can be edited in Feature Properties.')

    setSelectedAlignmentTraceId.mockClear()
    setFeatureEditor.mockClear()
    selectFeatureById.mockClear()
    setStatus.mockClear()
    act(() => controller.editDnaSequenceFeature('consensus-feature', null))
    expect(setSelectedAlignmentTraceId).toHaveBeenCalledWith(null)
    expect(selectFeatureById).toHaveBeenCalledWith('consensus-feature', false, false, { scroll: false, libraryMemberId: null })
    expect(setFeatureEditor).toHaveBeenCalledWith(expect.objectContaining({ libraryMemberId: null }))
  })
})
