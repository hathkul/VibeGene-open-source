// @vitest-environment jsdom
import { act, type Dispatch, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FeatureEditorState } from '../../domain/featureQualifiers'
import { labPlasmid } from '../../domain/fixtures'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { SelectionAnchor, SelectionRange } from '../sequence'
import { useFeatureStructureController, type FeatureStructureControllerOptions } from './useFeatureStructureController'

const focusSetterOrder = [
  'setCutSelectionAnchor',
  'setCutStrandSelection',
  'setCutSelectionEnzymes',
  'setSelectedPrimerId',
  'setSelectionFocus',
  'setSelectedFeatureId',
  'setSelectedRange',
  'setSelectionAnchor',
] as const

const successfulSegmentCallOrder = ['updateRecord', ...focusSetterOrder, 'setStatus'] as const

type RecordUpdater = (current: SequenceRecord) => SequenceRecord

function requireRecordUpdater(updater: RecordUpdater | undefined): RecordUpdater {
  if (updater === undefined) {
    throw new Error('Expected updateRecord to capture an updater')
  }
  return updater
}

describe('useFeatureStructureController', () => {
  const featureColor = labPlasmid.features[0]!.color

  function metadataRichFeature(locations: SequenceFeature['locations']): SequenceFeature {
    return {
      id: 'feature',
      name: 'Gene',
      type: 'CDS',
      color: featureColor,
      notes: 'lab note',
      cleavageArrows: [12, 18],
      locations,
    }
  }

  function expectMetadataRichFeaturePreserved(feature: SequenceFeature | undefined) {
    expect(feature).toMatchObject({
      id: 'feature',
      name: 'Gene',
      type: 'CDS',
      color: featureColor,
      notes: 'lab note',
      cleavageArrows: [12, 18],
    })
  }
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderController(overrides: Partial<FeatureStructureControllerOptions> = {}) {
    const {
      updateRecord: updateRecordOverride,
      setFeatureEditor: setFeatureEditorOverride,
      record: recordOverride,
      ...restOverrides
    } = overrides
    const status = vi.fn<(message: string) => void>()
    const callOrder: string[] = []
    const track = (name: string) => { callOrder.push(name) }
    const setCutSelectionAnchor = vi.fn<(value: null) => void>((value) => {
      track('setCutSelectionAnchor')
      expect(value).toBe(null)
    })
    const setCutStrandSelection = vi.fn<(value: null) => void>((value) => {
      track('setCutStrandSelection')
      expect(value).toBe(null)
    })
    const setCutSelectionEnzymes = vi.fn<(value: null) => void>((value) => {
      track('setCutSelectionEnzymes')
      expect(value).toBe(null)
    })
    const setSelectedPrimerId = vi.fn<(id: string | null) => void>((id) => {
      track('setSelectedPrimerId')
      expect(id).toBe(null)
    })
    const setSelectionFocus = vi.fn<(focus: 'feature') => void>((focus) => {
      track('setSelectionFocus')
      expect(focus).toBe('feature')
    })
    const setSelectedFeatureId = vi.fn<(featureId: string) => void>(() => {
      track('setSelectedFeatureId')
    })
    const setSelectedRange = vi.fn<(range: SelectionRange) => void>(() => {
      track('setSelectedRange')
    })
    const setSelectionAnchor = vi.fn<(anchor: SelectionAnchor) => void>(() => {
      track('setSelectionAnchor')
    })
    const setFeatureEditor = setFeatureEditorOverride
      ?? vi.fn<Dispatch<SetStateAction<FeatureEditorState | null>>>()
    const selectFeatureById = vi.fn()
    const openSplicedRecord = vi.fn()
    let currentRecord = recordOverride ?? labPlasmid
    let controller: ReturnType<typeof useFeatureStructureController>
    const options: FeatureStructureControllerOptions = {
      record: currentRecord,
      selectedRange: null,
      hasCutStrandSelection: false,
      selectedFeature: null,
      selectedFeatureId: null,
      selectedFeaturesForMenu: [],
      featureTabSelectionMemberId: null,
      setFeatureEditor,
      updateRecord: (updater) => {
        callOrder.push('updateRecord')
        if (updateRecordOverride) updateRecordOverride(updater)
        else currentRecord = updater(currentRecord)
      },
      setStatus: (message) => {
        callOrder.push('setStatus')
        status(message)
      },
      setCutSelectionAnchor,
      setCutStrandSelection,
      setCutSelectionEnzymes,
      setSelectedPrimerId,
      setSelectionFocus,
      setSelectedFeatureId,
      setSelectedRange,
      setSelectionAnchor,
      selectFeatureById,
      openSplicedRecord,
      ...restOverrides,
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useFeatureStructureController(options)
      return null
    }
    act(() => root.render(<Harness />))
    return {
      get controller() { return controller! },
      get record() { return currentRecord },
      callOrder,
      status,
      setFeatureEditor,
      setCutSelectionAnchor,
      setCutStrandSelection,
      setCutSelectionEnzymes,
      setSelectedPrimerId,
      setSelectionFocus,
      setSelectedFeatureId,
      setSelectedRange,
      setSelectionAnchor,
      selectFeatureById,
      openSplicedRecord,
    }
  }

  it('commits a split segment transition with full updateRecord-focus-status sequence', () => {
    const target = metadataRichFeature([{ start: 10, end: 30, strand: 'forward' }])
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    const result = renderController({ record })
    act(() => result.controller.createSegmentOnFeature(target.id, { start: 15, end: 20 }))
    expect(result.record.features[0]!.locations).toHaveLength(3)
    expectMetadataRichFeaturePreserved(result.record.features[0])
    expect(result.callOrder).toEqual([...successfulSegmentCallOrder])
    expect(result.setSelectedFeatureId).toHaveBeenCalledWith(target.id)
    expect(result.setSelectedRange).toHaveBeenCalledWith({ start: 15, end: 20 })
    expect(result.setSelectionAnchor).toHaveBeenCalledWith({
      kind: 'feature',
      forward: { start: 15, end: 20 },
      reverse: { start: 15, end: 20 },
    })
    expect(result.setFeatureEditor).not.toHaveBeenCalled()
    expect(result.status).toHaveBeenCalledWith('Split Gene at 16..20.')
  })

  it('applies focus and status before a deferred updateRecord updater runs', () => {
    const target: SequenceFeature = {
      id: 'feature', name: 'Gene', type: 'CDS', color: featureColor,
      locations: [{ start: 10, end: 30, strand: 'forward' }],
    }
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    let capturedUpdater: RecordUpdater | undefined
    const result = renderController({
      record,
      updateRecord: (updater) => { capturedUpdater = updater },
    })
    act(() => result.controller.createSegmentOnFeature(target.id, { start: 15, end: 20 }))
    expect(result.record.features[0]!.locations).toHaveLength(1)
    expect(result.callOrder).toEqual([...successfulSegmentCallOrder])
    expect(result.status).toHaveBeenCalledWith('Split Gene at 16..20.')
    expect(result.setSelectedRange).toHaveBeenCalledWith({ start: 15, end: 20 })
    const committed = requireRecordUpdater(capturedUpdater)(record)
    expect(committed.features[0]!.locations).toHaveLength(3)
  })

  it('defensively copies the range and uses independent forward/reverse anchor spans', () => {
    const target: SequenceFeature = {
      id: 'feature', name: 'Gene', type: 'CDS', color: featureColor,
      locations: [{ start: 10, end: 30, strand: 'forward' }],
    }
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    const result = renderController({ record })
    const range = { start: 15, end: 20 }
    act(() => result.controller.createSegmentOnFeature(target.id, range))
    range.start = 99
    const selectedRange = result.setSelectedRange.mock.calls[0]?.[0]
    expect(selectedRange).toEqual({ start: 15, end: 20 })
    const anchor = result.setSelectionAnchor.mock.calls[0]?.[0]
    expect(anchor).toMatchObject({
      kind: 'feature',
      forward: { start: 15, end: 20 },
      reverse: { start: 15, end: 20 },
    })
    expect(anchor?.forward).not.toBe(anchor?.reverse)
    if (anchor?.forward) anchor.forward.start = 77
    expect(anchor?.reverse).toEqual({ start: 15, end: 20 })
  })

  it('does not apply selection focus when the feature is missing', () => {
    const result = renderController({
      record: { ...labPlasmid, sequence: 'A'.repeat(100), features: [] },
    })
    act(() => result.controller.createSegmentOnFeature('missing', { start: 1, end: 2 }))
    expect(result.callOrder).toEqual([])
    expect(result.setCutSelectionAnchor).not.toHaveBeenCalled()
    expect(result.setSelectedFeatureId).not.toHaveBeenCalled()
    expect(result.setSelectedRange).not.toHaveBeenCalled()
    expect(result.setSelectionAnchor).not.toHaveBeenCalled()
    expect(result.status).not.toHaveBeenCalled()
  })

  it('does not apply selection focus when the range matches the whole feature', () => {
    const target: SequenceFeature = {
      id: 'feature', name: 'Gene', type: 'CDS', color: featureColor,
      locations: [{ start: 10, end: 30, strand: 'forward' }],
    }
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    const result = renderController({ record })
    act(() => result.controller.createSegmentOnFeature(target.id, { start: 10, end: 30 }))
    expect(result.record.features[0]!.locations).toHaveLength(1)
    expect(result.callOrder).toEqual(['setStatus'])
    expect(result.setSelectedFeatureId).not.toHaveBeenCalled()
    expect(result.setSelectedRange).not.toHaveBeenCalled()
    expect(result.setSelectionAnchor).not.toHaveBeenCalled()
    expect(result.status).toHaveBeenCalledWith('Selection already matches the whole feature. Select a sub-range inside it to create a segment.')
  })

  it('reports an appended disjoint segment and still focuses the new range', () => {
    const target = metadataRichFeature([{ start: 10, end: 30, strand: 'forward' }])
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    const result = renderController({ record })
    act(() => result.controller.createSegmentOnFeature(target.id, { start: 40, end: 50 }))
    expect(result.record.features[0]!.locations).toHaveLength(2)
    expectMetadataRichFeaturePreserved(result.record.features[0])
    expect(result.callOrder).toEqual([...successfulSegmentCallOrder])
    expect(result.setSelectedRange).toHaveBeenCalledWith({ start: 40, end: 50 })
    expect(result.setFeatureEditor).not.toHaveBeenCalled()
    expect(result.status).toHaveBeenCalledWith('Added segment 41..50 to Gene.')
  })

  it('opens a chooser when a cleavage caret is covered by multiple features', () => {
    const first: SequenceFeature = {
      id: 'first', name: 'First', type: 'misc_feature', color: featureColor,
      locations: [{ start: 0, end: 20, strand: 'forward' }],
    }
    const second: SequenceFeature = { ...first, id: 'second', name: 'Second' }
    const result = renderController({
      record: { ...labPlasmid, sequence: 'A'.repeat(100), features: [first, second] },
      selectedRange: { start: 10, end: 10 },
    })
    act(() => result.controller.addCleavageSite())
    expect(result.controller.cleavageChooser).toMatchObject({ position: 10, mode: 'add' })
    expect(result.controller.cleavageChooser?.features.map((feature) => feature.id)).toEqual(['first', 'second'])
  })

  it('selects the target feature after adding a cleavage site', () => {
    const target = metadataRichFeature([{ start: 10, end: 30, strand: 'forward' }])
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    const result = renderController({
      record,
      selectedRange: { start: 15, end: 15 },
    })

    act(() => result.controller.addCleavageSite())
    expect(result.setSelectedFeatureId).toHaveBeenLastCalledWith(target.id)
    expect(result.setSelectionFocus).toHaveBeenLastCalledWith('feature')
    expect(result.status).toHaveBeenLastCalledWith('Added cleavage site at 16 on Gene.')
  })

  it('selects the target feature after removing a cleavage site', () => {
    const target = { ...metadataRichFeature([{ start: 10, end: 30, strand: 'forward' }]), cleavageArrows: [15] }
    const record: SequenceRecord = { ...labPlasmid, sequence: 'A'.repeat(100), features: [target] }
    const result = renderController({
      record,
      selectedRange: { start: 15, end: 15 },
    })
    act(() => result.controller.removeCleavageSite())
    expect(result.setSelectedFeatureId).toHaveBeenLastCalledWith(target.id)
    expect(result.setSelectionFocus).toHaveBeenLastCalledWith('feature')
    expect(result.status).toHaveBeenLastCalledWith('Removed cleavage site at 16 from Gene.')
  })

  it('creates a new unsaved record when splicing a multi-segment feature', () => {
    const selectedFeature: SequenceFeature = {
      id: 'gene', name: 'Gene', type: 'CDS', color: featureColor,
      locations: [
        { start: 0, end: 4, strand: 'forward' },
        { start: 8, end: 12, strand: 'forward' },
      ],
    }
    const result = renderController({
      record: { ...labPlasmid, name: 'Source', sequence: 'AAAACCCCGGGGTTTT', features: [selectedFeature] },
      selectedFeature,
      selectedFeatureId: selectedFeature.id,
    })
    act(() => result.controller.spliceToRemoveIntrons())
    expect(result.openSplicedRecord).toHaveBeenCalledTimes(1)
    expect(result.openSplicedRecord.mock.calls[0]?.[0]).toMatchObject({
      name: 'Gene spliced', sequence: 'AAAAGGGG', topology: 'linear',
    })
  })
})
