import { useCallback } from 'react'
import type { SequenceFeature } from '../../domain/types'

export type FeatureOrProteinBondCommandOptions = {
  selectedProteinBondId: string | null
  selectedFeature: SequenceFeature | null
  recordIsDnaLibrary: boolean
  featureTabSelectionMemberId: string | null | undefined
  deleteProteinBond: (bondId: string) => void
  deleteSelectedFeature: () => void
  openProteinBondEditor: (bondId: string) => void
  openFeatureEditorForFeature: (featureId: string, editorOptions?: { scroll?: boolean; libraryMemberId?: string | null }) => void
}

/** Routes feature-tab edit/delete to the selected protein bond or feature. */
export function useFeatureOrProteinBondCommands(options: FeatureOrProteinBondCommandOptions) {
  const {
    selectedProteinBondId,
    selectedFeature,
    recordIsDnaLibrary,
    featureTabSelectionMemberId,
    deleteProteinBond,
    deleteSelectedFeature,
    openProteinBondEditor,
    openFeatureEditorForFeature,
  } = options

  const deleteSelectedFeatureOrBond = useCallback(() => {
    if (selectedProteinBondId) {
      deleteProteinBond(selectedProteinBondId)
      return
    }
    deleteSelectedFeature()
  }, [selectedProteinBondId, deleteProteinBond, deleteSelectedFeature])

  const editSelectedFeatureProperties = useCallback(() => {
    if (selectedProteinBondId) {
      openProteinBondEditor(selectedProteinBondId)
      return
    }
    if (selectedFeature) {
      openFeatureEditorForFeature(selectedFeature.id, {
        libraryMemberId: recordIsDnaLibrary ? (featureTabSelectionMemberId ?? null) : null,
      })
    }
  }, [
    selectedProteinBondId,
    selectedFeature,
    recordIsDnaLibrary,
    featureTabSelectionMemberId,
    openProteinBondEditor,
    openFeatureEditorForFeature,
  ])

  return { deleteSelectedFeatureOrBond, editSelectedFeatureProperties }
}
