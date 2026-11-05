// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import { useProteinBondController } from './useProteinBondController'

function proteinRecord(): SequenceRecord {
  return {
    id: 'protein', name: 'Protein', description: '', molecule: 'protein', topology: 'linear', sequence: 'MKT',
    features: [], primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    construct: {
      syntheticDna: false, confirmedExperimentally: false, laboratoryHostOrganism: null, sourceOrganism: null,
      bacterialTransformationStrain: null, hostMethylation: { dam: false, dcm: false, ecoKI: false },
      sequenceClass: '', accessionNumber: '', codeNumber: '', sequenceAuthor: '', comments: '', references: '',
    },
    protein: {
      numberingStart: 1, numberingRegions: [],
      bonds: [{ id: 'bond-1', name: 'Bond 1', type: 'disulfide', endpoints: [{ residue: 0 }, { residue: 2 }] }],
      comparisonSources: [], comparisonAlignmentCache: [],
    },
  }
}

describe('useProteinBondController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function mountController(record: SequenceRecord) {
    const setCutSelectionAnchor = vi.fn()
    const setCutStrandSelection = vi.fn()
    const setCutSelectionEnzymes = vi.fn()
    const setSelectedFeatureId = vi.fn()
    const setSelectedFeatureIds = vi.fn()
    const setSelectedPrimerId = vi.fn()
    const setSelectedPrimerIds = vi.fn()
    const setSelectedProteinBondId = vi.fn()
    const setSelectionFocus = vi.fn()
    const setSelectedRange = vi.fn()
    const setSelectionAnchor = vi.fn()
    const setStatus = vi.fn()
    const updateRecord = vi.fn()
    const commands = {
      selectProteinBondById: null as ReturnType<typeof useProteinBondController>['selectProteinBondById'] | null,
      selectProteinBondRow: null as ReturnType<typeof useProteinBondController>['selectProteinBondRow'] | null,
      setProteinBondVisibility: null as ReturnType<typeof useProteinBondController>['setProteinBondVisibility'] | null,
    }

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const controller = useProteinBondController({
        record,
        selectedRange: null,
        setProteinBondEditor: vi.fn(),
        setSelectedProteinBondId,
        setSelectionFocus,
        setSelectedRange,
        setSelectionAnchor,
        setCutSelectionAnchor,
        setCutStrandSelection,
        setCutSelectionEnzymes,
        setSelectedFeatureId,
        setSelectedFeatureIds,
        setSelectedPrimerId,
        setSelectedPrimerIds,
        updateRecord,
        setStatus,
      })
      commands.selectProteinBondById = controller.selectProteinBondById
      commands.selectProteinBondRow = controller.selectProteinBondRow
      commands.setProteinBondVisibility = controller.setProteinBondVisibility
      return null
    }

    act(() => root.render(<Harness />))
    return {
      commands,
      setCutSelectionAnchor,
      setCutStrandSelection,
      setCutSelectionEnzymes,
      setSelectedFeatureId,
      setSelectedFeatureIds,
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectedProteinBondId,
      setSelectionFocus,
      setSelectedRange,
      setSelectionAnchor,
      setStatus,
      updateRecord,
    }
  }

  it('selectProteinBondById validates the bond id and clears unrelated selection state', () => {
    const env = mountController(proteinRecord())

    act(() => env.commands.selectProteinBondById!('missing'))
    expect(env.setSelectedProteinBondId).not.toHaveBeenCalled()
    expect(env.setStatus).not.toHaveBeenCalled()

    act(() => env.commands.selectProteinBondById!('bond-1'))
    expect(env.setCutSelectionAnchor).toHaveBeenCalledWith(null)
    expect(env.setCutStrandSelection).toHaveBeenCalledWith(null)
    expect(env.setCutSelectionEnzymes).toHaveBeenCalledWith(null)
    expect(env.setSelectedFeatureId).toHaveBeenCalledWith(null)
    expect(env.setSelectedFeatureIds).toHaveBeenCalledWith([])
    expect(env.setSelectedPrimerId).toHaveBeenCalledWith(null)
    expect(env.setSelectedPrimerIds).toHaveBeenCalledWith([])
    expect(env.setSelectedProteinBondId).toHaveBeenCalledWith('bond-1')
    expect(env.setSelectionFocus).toHaveBeenCalledWith('bond')
    expect(env.setSelectedRange).toHaveBeenCalledWith(null)
    expect(env.setSelectionAnchor).toHaveBeenCalledWith(null)
    expect(env.setStatus).toHaveBeenCalledWith('Selected bond Bond 1.')
  })

  it('selectProteinBondRow only updates bond and feature selection ids', () => {
    const env = mountController(proteinRecord())

    act(() => env.commands.selectProteinBondRow!('missing'))
    expect(env.setSelectedProteinBondId).toHaveBeenCalledWith('missing')
    expect(env.setSelectedFeatureId).toHaveBeenCalledWith(null)
    expect(env.setSelectedFeatureIds).toHaveBeenCalledWith([])
    expect(env.setCutSelectionAnchor).not.toHaveBeenCalled()
    expect(env.setSelectionFocus).not.toHaveBeenCalled()
    expect(env.setStatus).not.toHaveBeenCalled()
  })

  it('setProteinBondVisibility toggles the visible flag through the record transition', () => {
    let record = proteinRecord()
    const env = mountController(record)
    env.updateRecord.mockImplementation((updater: (current: SequenceRecord) => SequenceRecord) => {
      record = updater(record)
    })

    act(() => env.commands.setProteinBondVisibility!('bond-1', false))
    expect(record.protein?.bonds[0].visible).toBe(false)

    act(() => env.commands.setProteinBondVisibility!('bond-1', true))
    expect(record.protein?.bonds[0].visible).toBeUndefined()
  })
})
