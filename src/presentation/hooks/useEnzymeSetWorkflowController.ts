import { useMemo, useState } from 'react'
import {
  findSavedEnzymeSet,
  normalizeRecordFileEnzymeSets,
  planChooseEnzymesConfirmation,
  planEnzymeSetModeSelection,
  planEnzymeSupplierSelection,
  planEnzymesVisibilityToggle,
  planExportEnzymeSet,
  planManageEnzymeSetsResult,
  planSaveEnzymeSet,
  planSavedEnzymeSetSelection,
  type EnzymesDisplayPatch,
  type EnzymeSetStorageScope,
  type ManageEnzymeSetsResult,
} from '../../application/enzymeSets'
import {
  createSavedEnzymeSetId,
  type EnzymePreferences,
  type SavedEnzymeSet,
} from '../../domain/enzymePreferences'
import type { EnzymeManufacturerId } from '../../domain/types'
import {
  createChooseEnzymesDraft,
  resolveActiveEnzymeSetExport,
  type ChooseEnzymesDraft,
} from '../dnaViewControls'
import type { DisplaySettings, EnzymeSetMode } from '../sequence'

export type EnzymeSetWorkflowInput = {
  displaySection: DisplaySettings['enzymes']
  preferences: EnzymePreferences
  parentalCounts: Record<string, number>
  fileSets: SavedEnzymeSet[]
}

export type EnzymeSetWorkflowPorts = {
  applyDisplayPatch: (patch: EnzymesDisplayPatch) => void
  applyPreferences: (next: EnzymePreferences) => void
  commitFileSets: (sets: SavedEnzymeSet[] | undefined) => void
  status: (message: string) => void
  download: (fileName: string, content: string) => void
  createId?: () => string
}

/**
 * Owns the enzyme-set workflow state (choose-enzymes draft, save-set dialog,
 * manage-sets dialog, and noncutters dialog) and orchestrates the menu,
 * dialog, and workspace commands through explicit ports. Deterministic
 * planning lives in `src/application/enzymeSets/`; this hook only sequences
 * state, ports, and statuses.
 */
export function useEnzymeSetWorkflowController(
  input: EnzymeSetWorkflowInput,
  ports: EnzymeSetWorkflowPorts,
) {
  const [chooseDraft, setChooseDraft] = useState<ChooseEnzymesDraft | null>(null)
  const [saveSetOpen, setSaveSetOpen] = useState(false)
  const [saveSetName, setSaveSetName] = useState('')
  const [saveSetScope, setSaveSetScope] = useState<EnzymeSetStorageScope>('global')
  const [manageSetsOpen, setManageSetsOpen] = useState(false)
  const [noncuttersOpen, setNoncuttersOpen] = useState(false)

  const activeEnzymeSetExport = useMemo(
    () =>
      resolveActiveEnzymeSetExport({
        settings: input.displaySection,
        preferences: input.preferences,
        parentalCounts: input.parentalCounts,
        fileEnzymeSets: input.fileSets,
      }),
    [input.displaySection, input.preferences, input.parentalCounts, input.fileSets],
  )

  function selectSet(set: EnzymeSetMode) {
    ports.applyDisplayPatch(
      planEnzymeSetModeSelection({
        set,
        currentSupplierSetId: input.displaySection.supplierSetId,
      }),
    )
  }

  function selectSupplier(supplierId: EnzymeManufacturerId) {
    ports.applyDisplayPatch(planEnzymeSupplierSelection(supplierId))
  }

  function selectSavedSet(savedSetId: string) {
    const saved = findSavedEnzymeSet(input.preferences.savedEnzymeSets, savedSetId)
    if (!saved) return
    ports.applyDisplayPatch(planSavedEnzymeSetSelection(saved))
  }

  function selectFileSet(savedSetId: string) {
    const saved = findSavedEnzymeSet(input.fileSets, savedSetId)
    if (!saved) return
    ports.applyDisplayPatch(planSavedEnzymeSetSelection(saved))
  }

  function openChoose() {
    setChooseDraft(createChooseEnzymesDraft(input.displaySection))
  }

  function applyChooseDraftPatch(patch: Partial<ChooseEnzymesDraft>) {
    setChooseDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function confirmChoose(selectedNames: string[]) {
    ports.applyDisplayPatch(planChooseEnzymesConfirmation(selectedNames))
    setChooseDraft(null)
  }

  function toggleVisibility() {
    ports.applyDisplayPatch(planEnzymesVisibilityToggle(input.displaySection.visible))
  }

  function openSaveSet() {
    if (activeEnzymeSetExport.enzymeNames.length === 0) return
    setSaveSetName(activeEnzymeSetExport.name)
    setSaveSetScope('global')
    setSaveSetOpen(true)
  }

  function confirmSaveSet() {
    const plan = planSaveEnzymeSet({
      rawName: saveSetName,
      scope: saveSetScope,
      enzymeNames: activeEnzymeSetExport.enzymeNames,
      savedEnzymeSets: input.preferences.savedEnzymeSets,
      fileEnzymeSets: input.fileSets,
      createId: ports.createId ?? createSavedEnzymeSetId,
    })
    if (plan.kind === 'invalid') return
    if (plan.kind === 'file') {
      ports.commitFileSets(normalizeRecordFileEnzymeSets(plan.nextFileSets))
    } else {
      ports.applyPreferences({ ...input.preferences, savedEnzymeSets: plan.nextSavedSets })
    }
    ports.applyDisplayPatch(plan.displayPatch)
    ports.status(plan.statusMessage)
    setSaveSetOpen(false)
    setSaveSetName('')
  }

  function exportSet() {
    const plan = planExportEnzymeSet(activeEnzymeSetExport)
    if (plan.kind === 'empty') {
      ports.status(plan.statusMessage)
      return
    }
    ports.download(plan.fileName, plan.content)
    ports.status(plan.statusMessage)
  }

  function confirmManageSets(result: ManageEnzymeSetsResult) {
    const plan = planManageEnzymeSetsResult(result)
    ports.applyPreferences({ ...input.preferences, savedEnzymeSets: plan.nextSavedSets })
    ports.commitFileSets(plan.nextFileSets)
    setManageSetsOpen(false)
    ports.status('Updated enzyme sets.')
  }

  function updateFileEnzymeSets(sets: SavedEnzymeSet[]) {
    ports.commitFileSets(normalizeRecordFileEnzymeSets(sets))
  }

  return {
    chooseDraft,
    setChooseDraft,
    applyChooseDraftPatch,
    openChoose,
    confirmChoose,
    selectSet,
    selectSupplier,
    selectSavedSet,
    selectFileSet,
    toggleVisibility,
    activeEnzymeSetExport,
    saveSetOpen,
    setSaveSetOpen,
    saveSetName,
    setSaveSetName,
    saveSetScope,
    setSaveSetScope,
    openSaveSet,
    confirmSaveSet,
    exportSet,
    manageSetsOpen,
    setManageSetsOpen,
    confirmManageSets,
    updateFileEnzymeSets,
    noncuttersOpen,
    setNoncuttersOpen,
  }
}

export type EnzymeSetWorkflowController = ReturnType<typeof useEnzymeSetWorkflowController>
