// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import type { SequenceFeature } from '../../domain/types'
import { useWorkspaceAnnotationSelectionController, type WorkspaceAnnotationSelectionOptions } from './useWorkspaceAnnotationSelectionController'

const feature = (id: string, start: number, end: number): SequenceFeature => ({
  id, name: id, type: 'misc_feature', color: '', locations: [{ start, end, strand: 'forward' }],
})

describe('map and sequence feature selection', () => {
  it('selects a DNA span only for exactly two features and restores it after deselection', () => {
    const first = feature('first', 10, 20)
    const second = feature('second', 40, 50)
    const third = feature('third', 70, 80)
    const setSelectedRange = vi.fn()
    const setSelectedFeatureId = vi.fn()
    const setSelectedFeatureIds = vi.fn()
    const options = {
      record: { ...labPlasmid, sequence: 'A'.repeat(100), topology: 'linear', features: [first, second, third] },
      traceFiles: [], selectableAnnotations: [first, second, third], alignmentsVisible: false,
      selectedAlignmentTraceId: null, selectionFocus: 'feature',
      selectionAnchor: { kind: 'feature', forward: { start: 10, end: 20 }, reverse: { start: 10, end: 20 } },
      selectedFeatureId: 'first', selectedFeatureIds: ['first'], selectedPrimerIds: [], selectedRange: { start: 10, end: 20 },
      featureTabSelectionMemberId: null,
      setSelectedProteinBondId: vi.fn(), setCutSelectionAnchor: vi.fn(), setCutStrandSelection: vi.fn(),
      setCutSelectionEnzymes: vi.fn(), setSelectedPrimerId: vi.fn(), setSelectedPrimerIds: vi.fn(),
      setSelectedFeatureId, setSelectedFeatureIds, setFeatureTabSelectionMemberId: vi.fn(), setFeatureTabAnchor: vi.fn(),
      setSelectionFocus: vi.fn(), setSelectedRange, setSelectionAnchor: vi.fn(), setStatus: vi.fn(),
    } as unknown as WorkspaceAnnotationSelectionOptions
    let controller!: ReturnType<typeof useWorkspaceAnnotationSelectionController>
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() { controller = useWorkspaceAnnotationSelectionController(options); return null }
    act(() => root.render(<Harness />))
    act(() => controller.selectFeatureById('second', true))
    expect(setSelectedRange).toHaveBeenLastCalledWith({ start: 10, end: 50 })
    expect(setSelectedFeatureIds).toHaveBeenLastCalledWith(['first', 'second'])

    options.selectedFeatureIds = ['first', 'second']
    act(() => root.render(<Harness />))
    act(() => controller.selectFeatureById('third', true))
    expect(setSelectedFeatureIds).toHaveBeenLastCalledWith(['first', 'second', 'third'])
    expect(setSelectedRange).toHaveBeenLastCalledWith(null)

    options.selectedFeatureIds = ['first', 'second', 'third']
    act(() => root.render(<Harness />))
    act(() => controller.selectFeatureById('third', true))
    expect(setSelectedFeatureIds).toHaveBeenLastCalledWith(['first', 'second'])
    expect(setSelectedRange).toHaveBeenLastCalledWith({ start: 10, end: 50 })

    options.selectedFeatureIds = ['first', 'second']
    act(() => root.render(<Harness />))
    act(() => controller.selectFeatureById('second', true))
    expect(setSelectedFeatureIds).toHaveBeenLastCalledWith(['first'])
    expect(setSelectedFeatureId).toHaveBeenLastCalledWith('first')
    expect(setSelectedRange).toHaveBeenLastCalledWith({ start: 10, end: 20 })
    act(() => root.unmount())
    host.remove()
  })
})
