import { themeFixturePalette } from '../../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import { useProteinSequenceEditController } from './useProteinSequenceEditController'

function proteinRecord(): SequenceRecord {
  return {
    id: 'protein', name: 'Protein', description: '', molecule: 'protein', topology: 'linear', sequence: 'MKT',
    features: [{ id: 'feature', name: 'Feature', type: 'misc_feature', color: themeFixturePalette.purpleFixture, locations: [{ start: 2, end: 3, strand: 'forward' }] }],
    primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    construct: {
      syntheticDna: false, confirmedExperimentally: false, laboratoryHostOrganism: null, sourceOrganism: null,
      bacterialTransformationStrain: null, hostMethylation: { dam: false, dcm: false, ecoKI: false },
      sequenceClass: '', accessionNumber: '', codeNumber: '', sequenceAuthor: '', comments: '', references: '',
    },
    protein: {
      numberingStart: 1, numberingRegions: [], comparisonSources: [], comparisonAlignmentCache: [{ sourceId: 'old', signature: 'old', alignment: null }],
      bonds: [{ id: 'bond', name: 'Bond', type: 'disulfide', endpoints: [{ residue: 1 }, { residue: 2 }] }],
    },
  }
}

describe('useProteinSequenceEditController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('preserves the protein edit history, annotation/bond, cache, and selection-reset sequence', () => {
    let record = proteinRecord()
    const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord) => { record = updater(record) })
    const setCutSelectionAnchor = vi.fn()
    const setCutStrandSelection = vi.fn()
    const setCutSelectionEnzymes = vi.fn()
    const setSelectedFeatureId = vi.fn()
    const setSelectedFeatureIds = vi.fn()
    const setSelectedPrimerId = vi.fn()
    const setSelectedPrimerIds = vi.fn()
    const setSelectionFocus = vi.fn()
    const setSelectedRange = vi.fn()
    const setSelectionAnchor = vi.fn()
    const setStatus = vi.fn()
    let edit: ReturnType<typeof useProteinSequenceEditController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      edit = useProteinSequenceEditController({
        updateRecord, setCutSelectionAnchor, setCutStrandSelection, setCutSelectionEnzymes,
        setSelectedFeatureId, setSelectedFeatureIds, setSelectedPrimerId, setSelectedPrimerIds,
        setSelectionFocus, setSelectedRange, setSelectionAnchor, setStatus,
      })
      return null
    }

    act(() => root.render(<Harness />))
    const nextRange = { start: 1, end: 3 }
    act(() => edit!('MQQ', nextRange, { start: 1, end: 2, insertedLength: 2 }, 'Edited protein sequence'))

    expect(updateRecord).toHaveBeenCalledOnce()
    expect(record.sequence).toBe('MQQ')
    expect(record.features[0].locations).toEqual([{ start: 3, end: 4, strand: 'forward' }])
    expect(record.protein?.bonds).toEqual([])
    expect(record.protein?.comparisonAlignmentCache).toEqual([])
    expect(record.operations.at(-1)).toMatchObject({ type: 'editProteinSequence', summary: 'Edited protein sequence' })
    expect(setCutSelectionAnchor).toHaveBeenCalledWith(null)
    expect(setCutStrandSelection).toHaveBeenCalledWith(null)
    expect(setCutSelectionEnzymes).toHaveBeenCalledWith(null)
    expect(setSelectedFeatureId).toHaveBeenCalledWith(null)
    expect(setSelectedFeatureIds).toHaveBeenCalledWith([])
    expect(setSelectedPrimerId).toHaveBeenCalledWith(null)
    expect(setSelectedPrimerIds).toHaveBeenCalledWith([])
    expect(setSelectionFocus).toHaveBeenCalledWith('dna')
    expect(setSelectedRange).toHaveBeenCalledWith(nextRange)
    expect(setSelectionAnchor).toHaveBeenCalledWith({ kind: 'base', forward: nextRange, reverse: nextRange })
    expect(setStatus).toHaveBeenCalledWith('Edited protein sequence')
  })
})
