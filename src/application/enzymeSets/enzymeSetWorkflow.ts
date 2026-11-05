import {
  type SavedEnzymeSet,
} from '../../domain/enzymePreferences'
import { enzymeSetDownloadFileName, formatEnzymeSetTxt } from '../../domain/enzymeSetFile'
import type { EnzymeManufacturerId } from '../../domain/types'

/**
 * Mirrors the display-layer EnzymeSetMode literal union so this strict module
 * stays free of presentation imports; the unions are structurally identical
 * and interchangeable at the composition boundary.
 */
export type EnzymeSetModeName =
  | 'all'
  | 'nonredundant'
  | 'supplier'
  | 'unique'
  | 'unique-dual'
  | 'six-plus'
  | 'unique-six-plus'
  | 'type-iis'
  | 'custom'

export type EnzymeSetStorageScope = 'global' | 'file'

/** Display-section patch for the enzymes view controls. */
export type EnzymesDisplayPatch = {
  set?: EnzymeSetModeName
  visible?: boolean
  supplierSetId?: EnzymeManufacturerId | null
  selectedNames?: string[]
}

export function planEnzymeSetModeSelection(options: {
  set: EnzymeSetModeName
  currentSupplierSetId: EnzymeManufacturerId | null
}): EnzymesDisplayPatch {
  return {
    set: options.set,
    visible: true,
    supplierSetId: options.set === 'supplier' ? options.currentSupplierSetId : null,
  }
}

export function planEnzymeSupplierSelection(supplierId: EnzymeManufacturerId): EnzymesDisplayPatch {
  return { set: 'supplier', supplierSetId: supplierId, visible: true }
}

export function findSavedEnzymeSet(
  sets: readonly SavedEnzymeSet[],
  id: string,
): SavedEnzymeSet | null {
  return sets.find((entry) => entry.id === id) ?? null
}

export function planSavedEnzymeSetSelection(saved: SavedEnzymeSet): EnzymesDisplayPatch {
  return {
    set: 'custom',
    selectedNames: [...saved.enzymeNames],
    supplierSetId: null,
    visible: true,
  }
}

export function planChooseEnzymesConfirmation(selectedNames: string[]): EnzymesDisplayPatch {
  return { set: 'custom', selectedNames, visible: true }
}

export function planEnzymesVisibilityToggle(currentVisible: boolean): EnzymesDisplayPatch {
  return { visible: !currentVisible }
}

export type SaveEnzymeSetPlan =
  | { kind: 'invalid' }
  | {
      kind: 'saved'
      nextSavedSets: SavedEnzymeSet[]
      displayPatch: EnzymesDisplayPatch
      statusMessage: string
    }
  | {
      kind: 'file'
      nextFileSets: SavedEnzymeSet[]
      displayPatch: EnzymesDisplayPatch
      statusMessage: string
    }

/**
 * Plans a Save Enzyme Set confirmation: trims and validates the name, rejects
 * empty sets, and upserts case-insensitively so a name collision replaces in
 * place and preserves the existing set id and metadata.
 */
export function planSaveEnzymeSet(options: {
  rawName: string
  scope: EnzymeSetStorageScope
  enzymeNames: readonly string[]
  savedEnzymeSets: readonly SavedEnzymeSet[]
  fileEnzymeSets: readonly SavedEnzymeSet[]
  createId: () => string
}): SaveEnzymeSetPlan {
  const name = options.rawName.trim()
  if (!name || options.enzymeNames.length === 0) return { kind: 'invalid' }
  const enzymeNames = [...options.enzymeNames]
  const displayPatch: EnzymesDisplayPatch = {
    set: 'custom',
    selectedNames: enzymeNames,
    supplierSetId: null,
    visible: true,
  }
  if (options.scope === 'file') {
    return {
      kind: 'file',
      nextFileSets: upsertEnzymeSet(options.fileEnzymeSets, name, enzymeNames, options.createId),
      displayPatch,
      statusMessage: `Saved enzyme set “${name}” to this file.`,
    }
  }
  return {
    kind: 'saved',
    nextSavedSets: upsertEnzymeSet(options.savedEnzymeSets, name, enzymeNames, options.createId),
    displayPatch,
    statusMessage: `Saved enzyme set “${name}”.`,
  }
}

/** Case-insensitive name collision replaces in place, preserving id and metadata. */
function upsertEnzymeSet(
  sets: readonly SavedEnzymeSet[],
  name: string,
  enzymeNames: string[],
  createId: () => string,
): SavedEnzymeSet[] {
  const next = [...sets]
  const existingIndex = next.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase())
  if (existingIndex >= 0) {
    next[existingIndex] = { ...next[existingIndex]!, name, enzymeNames }
  } else {
    next.push({ id: createId(), name, enzymeNames })
  }
  return next
}

export type ManageEnzymeSetsResult = {
  savedEnzymeSets: SavedEnzymeSet[]
  fileEnzymeSets: SavedEnzymeSet[]
}

/** Applies a Manage Sets confirmation; an empty file list clears the record field. */
export function planManageEnzymeSetsResult(result: ManageEnzymeSetsResult): {
  nextSavedSets: SavedEnzymeSet[]
  nextFileSets: SavedEnzymeSet[] | undefined
} {
  return {
    nextSavedSets: result.savedEnzymeSets,
    nextFileSets: result.fileEnzymeSets.length ? result.fileEnzymeSets : undefined,
  }
}

/** Normalizes a record file-enzyme-set list; empty lists clear the record field. */
export function normalizeRecordFileEnzymeSets(sets: SavedEnzymeSet[]): SavedEnzymeSet[] | undefined {
  return sets.length ? sets : undefined
}

export type EnzymeSetExportPlan =
  | { kind: 'empty'; statusMessage: string }
  | { kind: 'download'; fileName: string; content: string; statusMessage: string }

/** Prepares the active-set download, or the empty-set status when nothing can export. */
export function planExportEnzymeSet(active: {
  name: string
  enzymeNames: readonly string[]
}): EnzymeSetExportPlan {
  if (active.enzymeNames.length === 0) {
    return { kind: 'empty', statusMessage: 'No enzymes in the current set to export.' }
  }
  return {
    kind: 'download',
    fileName: enzymeSetDownloadFileName(active.name),
    content: formatEnzymeSetTxt(active.name, [...active.enzymeNames]),
    statusMessage: `Exported enzyme set “${active.name}”.`,
  }
}
