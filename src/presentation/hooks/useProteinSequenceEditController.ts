import { useCallback } from 'react'
import type { ComponentProps } from 'react'
import { ProteinSequencePane } from '../protein/ProteinSequencePane'
import { applySequenceReplacementAnnotations, addOperation } from '../../domain/sequence'
import { adjustProteinBondsForReplacement } from '../../domain/proteinBonds'
import type { SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../../application/selectionEditing/selectionEditing'

type SequenceEdit = NonNullable<ComponentProps<typeof ProteinSequencePane>['onSequenceEdit']>
type Replacement = Parameters<SequenceEdit>[2]

type Options = {
  updateRecord: (updater: (record: SequenceRecord) => SequenceRecord) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectedFeatureId: (value: null) => void
  setSelectedFeatureIds: (value: string[]) => void
  setSelectedPrimerId: (value: null) => void
  setSelectedPrimerIds: (value: string[]) => void
  setSelectionFocus: (value: 'dna') => void
  setSelectedRange: (value: SelectionRange) => void
  setSelectionAnchor: (value: { kind: 'base'; forward: SelectionRange; reverse: SelectionRange }) => void
  setStatus: (value: string) => void
}

export function useProteinSequenceEditController(options: Options): SequenceEdit {
  return useCallback((sequence, nextRange, replacement: Replacement, detail) => {
    options.updateRecord((current) => {
      const annotations = applySequenceReplacementAnnotations(
        current,
        replacement.start,
        replacement.end,
        replacement.insertedLength,
      )
      return addOperation({
        ...current,
        sequence,
        features: annotations.features,
        primers: annotations.primers,
        protein: current.protein ? {
          ...current.protein,
          bonds: adjustProteinBondsForReplacement(
            current.protein.bonds,
            replacement.start,
            replacement.end,
            replacement.insertedLength,
          ),
          comparisonAlignmentCache: [],
          binderNumbering: undefined,
          binderStructure: undefined,
        } : current.protein,
      }, 'editProteinSequence', detail)
    })
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setSelectionFocus('dna')
    options.setSelectedRange(nextRange)
    options.setSelectionAnchor({ kind: 'base', forward: nextRange, reverse: nextRange })
    options.setStatus(detail)
  }, [options])
}
