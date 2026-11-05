import { useCallback } from 'react'
import type { PrimerPaneSgRnaRow } from '../../domain/primerPaneEntries'

export type PrimerOrSgRnaDeleteCommandOptions = {
  selectedPaneSgRna?: PrimerPaneSgRnaRow
  deleteSelectedFeature: () => void
  removeSelectedPrimers: () => void
}

/** Routes mixed primer-pane delete to sgRNA feature removal or primer removal. */
export function usePrimerOrSgRnaDeleteCommand(options: PrimerOrSgRnaDeleteCommandOptions) {
  const { selectedPaneSgRna, deleteSelectedFeature, removeSelectedPrimers } = options

  return useCallback(() => {
    if (selectedPaneSgRna?.kind === 'sgrna') {
      deleteSelectedFeature()
      return
    }
    removeSelectedPrimers()
  }, [selectedPaneSgRna, deleteSelectedFeature, removeSelectedPrimers])
}
