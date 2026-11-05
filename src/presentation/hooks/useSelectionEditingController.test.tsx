// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import { useSelectionEditingController } from './useSelectionEditingController'

describe('useSelectionEditingController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('starts neutral rather than inferring a selection from the first feature', () => {
    let controller: ReturnType<typeof useSelectionEditingController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useSelectionEditingController(labPlasmid, 'Map')
      return null
    }

    act(() => root.render(<Harness />))
    expect(controller!.selectedFeatureId).toBeNull()
    expect(controller!.selectedFeatureIds).toEqual([])
    expect(controller!.selectedRange).toBeNull()
    expect(controller!.selectionFocus).toBe('dna')
    expect(controller!.activeTab).toBe('Map')
    expect(controller!.undoStack).toEqual([])
    expect(controller!.redoStack).toEqual([])
  })

  it('clears every document-scoped selection when a new document replaces the workspace', () => {
    let controller: ReturnType<typeof useSelectionEditingController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useSelectionEditingController(labPlasmid, 'Map')
      return null
    }

    act(() => root.render(<Harness />))
    act(() => {
      controller!.setSelectedFeatureId('feature')
      controller!.setSelectedFeatureIds(['feature'])
      controller!.setFeatureTabSelectionMemberId('member')
      controller!.setFeatureTabAnchor({ featureId: 'feature', memberId: 'member' })
      controller!.setPrimerTabAnchorId('primer')
      controller!.setSelectedPrimerId('primer')
      controller!.setSelectedPrimerIds(['primer'])
      controller!.setSelectionFocus('primer')
      controller!.setSelectedRange({ start: 4, end: 12 })
      controller!.setSelectionAnchor({ kind: 'primer', forward: { start: 4, end: 12 }, reverse: { start: 4, end: 12 } })
    })
    act(() => controller!.clearDocumentSelection())

    expect(controller!.selectedFeatureId).toBeNull()
    expect(controller!.selectedFeatureIds).toEqual([])
    expect(controller!.featureTabSelectionMemberId).toBeNull()
    expect(controller!.featureTabAnchor).toBeNull()
    expect(controller!.primerTabAnchorId).toBeNull()
    expect(controller!.selectedPrimerId).toBeNull()
    expect(controller!.selectedPrimerIds).toEqual([])
    expect(controller!.selectionFocus).toBe('dna')
    expect(controller!.selectedRange).toBeNull()
    expect(controller!.selectionAnchor).toBeNull()
  })
})
