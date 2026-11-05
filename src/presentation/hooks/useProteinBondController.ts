import { useCallback } from 'react'
import { DEFAULT_PROTEIN_BOND_STROKE_WIDTH, defaultProteinBondColor, defaultProteinBondResidues } from '../../domain/proteinBonds'
import { createId } from '../../domain/sequence'
import { removeProteinBond, setProteinBondVisibility as applyProteinBondVisibility, upsertProteinBond } from '../../application/proteinWorkflow/proteinWorkflow'
import type { ProteinBond, SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../sequence'

export type ProteinBondControllerOptions = {
  record: SequenceRecord
  selectedRange: SelectionRange | null
  setProteinBondEditor: (bond: ProteinBond | null) => void
  setSelectedProteinBondId: (id: string | null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSelectionAnchor: (range: null) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setStatus: (status: string) => void
}

export function useProteinBondController(options: ProteinBondControllerOptions) {
  const selectProteinBondById = useCallback((bondId: string) => {
    const bond = options.record.protein?.bonds.find((candidate) => candidate.id === bondId)
    if (!bond) return
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setSelectedProteinBondId(bondId)
    options.setSelectionFocus('bond')
    options.setSelectedRange(null)
    options.setSelectionAnchor(null)
    options.setStatus(`Selected bond ${bond.name || 'Bond'}.`)
  }, [options])

  const selectProteinBondRow = useCallback((bondId: string) => {
    options.setSelectedProteinBondId(bondId)
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
  }, [options])

  const setProteinBondVisibility = useCallback((bondId: string, visible: boolean) => {
    options.updateRecord((current) => applyProteinBondVisibility(current, bondId, visible))
  }, [options])

  const addProteinBond = useCallback(() => {
    if (options.record.molecule !== 'protein' || options.record.sequence.length === 0) return
    const [startResidue, endResidue] = defaultProteinBondResidues(options.record.sequence.length, options.selectedRange)
    options.setProteinBondEditor({
      id: createId('protein-bond'),
      name: 'Disulfide bond',
      type: 'disulfide',
      color: defaultProteinBondColor('disulfide'),
      strokeWidth: DEFAULT_PROTEIN_BOND_STROKE_WIDTH,
      endpoints: [{ residue: startResidue }, { residue: endResidue }],
    })
  }, [options])

  const openProteinBondEditor = useCallback((bondId: string) => {
    const bond = options.record.protein?.bonds.find((candidate) => candidate.id === bondId)
    if (!bond) return
    selectProteinBondById(bondId)
    options.setProteinBondEditor({ ...bond, endpoints: [{ ...bond.endpoints[0] }, { ...bond.endpoints[1] }] })
  }, [options, selectProteinBondById])

  const saveProteinBond = useCallback((next: ProteinBond) => {
    const exists = options.record.protein?.bonds.some((bond) => bond.id === next.id) ?? false
    options.updateRecord((current) => upsertProteinBond(current, next))
    options.setProteinBondEditor(null)
    options.setStatus(exists ? `Updated bond ${next.name || 'Bond'}.` : `Added bond ${next.name || 'Bond'}.`)
  }, [options])

  const deleteProteinBond = useCallback((bondId: string) => {
    options.updateRecord((current) => removeProteinBond(current, bondId))
    options.setProteinBondEditor(null)
    options.setSelectedProteinBondId(null)
    options.setSelectionFocus('dna')
    options.setStatus('Deleted protein bond.')
  }, [options])

  return {
    addProteinBond,
    openProteinBondEditor,
    selectProteinBondById,
    selectProteinBondRow,
    setProteinBondVisibility,
    saveProteinBond,
    deleteProteinBond,
  }
}
