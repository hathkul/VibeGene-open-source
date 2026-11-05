import {
  type DisplaySettings,
  type DnaAlignmentMode,
  type EnzymeSetMode,
} from '../sequence'
import { manufacturerLabel, type EnzymePreferences, type SavedEnzymeSet } from '../../domain/enzymePreferences'
import { enzymeNamesForStandardSet, enzymeNamesForSupplierSet, type ManageStandardSetId } from '../../domain/manageEnzymeSets'
import { type EnzymeManufacturerId } from '../../domain/types'
import {
  type ChooseEnzymesCriteria,
  type ChooseEnzymesCutCountMode,
  type ChooseEnzymesCutCountScope,
  type ChooseEnzymesCutLocation,
  type ChooseEnzymesOverhangFilter,
  type ChooseEnzymesSourceSet,
} from '../../domain/chooseEnzymesFilters'
import { type OrfDisplayMode } from '../../domain/orfPrediction'

export function enzymeSetModeLabel(
  mode: EnzymeSetMode,
  customCount: number,
  supplierSetId: EnzymeManufacturerId | null,
  savedSetName?: string | null,
) {
  if (mode === 'nonredundant') return 'Nonredundant Commercial'
  if (mode === 'supplier' && supplierSetId) return manufacturerLabel(supplierSetId)
  if (mode === 'unique') return 'Unique Cutters'
  if (mode === 'unique-dual') return 'Unique & Dual Cutters'
  if (mode === 'six-plus') return '6+ Cutters'
  if (mode === 'unique-six-plus') return 'Unique 6+ Cutters'
  if (mode === 'type-iis') return 'Type IIS'
  if (mode === 'custom') return savedSetName?.trim() ? savedSetName : `Custom (${customCount})`
  return 'All Commercial'
}

export function resolveActiveEnzymeSetExport(options: {
  settings: DisplaySettings['enzymes']
  preferences: EnzymePreferences
  parentalCounts: Record<string, number>
  fileEnzymeSets?: SavedEnzymeSet[]
}): { name: string; enzymeNames: string[] } {
  const { settings, preferences, parentalCounts, fileEnzymeSets = [] } = options
  if (settings.set === 'custom') {
    const selected = new Set(settings.selectedNames)
    const matchSaved = (sets: SavedEnzymeSet[]) =>
      sets.find(
        (saved) =>
          saved.enzymeNames.length === selected.size &&
          saved.enzymeNames.every((name) => selected.has(name)),
      )
    const matched = matchSaved(preferences.savedEnzymeSets) ?? matchSaved(fileEnzymeSets)
    return {
      name: matched?.name ?? `Custom (${settings.selectedNames.length})`,
      enzymeNames: [...settings.selectedNames].toSorted((left, right) => left.localeCompare(right)),
    }
  }
  if (settings.set === 'all' || settings.set === 'nonredundant') {
    const enzymeNames = enzymeNamesForSupplierSet(settings.set, preferences)
    return { name: enzymeSetModeLabel(settings.set, enzymeNames.length, null), enzymeNames }
  }
  if (settings.set === 'supplier') {
    const supplierId = settings.supplierSetId ?? preferences.supplierOrder[0] ?? 'neb'
    const enzymeNames = enzymeNamesForSupplierSet(supplierId, preferences)
    return {
      name: enzymeSetModeLabel('supplier', enzymeNames.length, supplierId),
      enzymeNames,
    }
  }
  const standardId = settings.set as ManageStandardSetId
  const enzymeNames = enzymeNamesForStandardSet(standardId, parentalCounts)
  return {
    name: enzymeSetModeLabel(settings.set, enzymeNames.length, null),
    enzymeNames,
  }
}


export function orfModeLabel(mode: OrfDisplayMode) {
  if (mode === 'orfs-only') return 'ORFs Only'
  if (mode === 'frame-plus-1') return 'Frame +1 Only'
  if (mode === 'top-3') return 'Top 3 Frames'
  if (mode === 'bottom-3') return 'Bottom 3 Frames'
  return 'All 6 Frames'
}

export type OrfTranslationDraft = Pick<
  DisplaySettings['orfs'],
  'minimumLengthAa' | 'requireStartCodon' | 'startCodon' | 'geneticCode' | 'applyToExistingFeatures' | 'preview'
>


export type ChooseEnzymesDraft = {
  selectedNames: string[]
  sourceSet: ChooseEnzymesSourceSet
  query: string
  criteriaEnabled: boolean
  criteriaSourceSet: ChooseEnzymesSourceSet
  cutLocation: ChooseEnzymesCutLocation
  cutCountMode: ChooseEnzymesCutCountMode
  cutCountAtLeast: number
  cutCountExact: number
  cutCountRangeMin: number
  cutCountRangeMax: number
  cutCountScope: ChooseEnzymesCutCountScope
  overhang: ChooseEnzymesOverhangFilter
  recognitionMin: number
  recognitionMax: number
}

export function catalogSourceFromSettings(settings: DisplaySettings['enzymes']): ChooseEnzymesSourceSet {
  if (settings.set === 'supplier' && settings.supplierSetId) return `supplier:${settings.supplierSetId}`
  if (settings.set === 'nonredundant') return 'nonredundant'
  return 'all'
}

export function createChooseEnzymesDraft(settings: DisplaySettings['enzymes']): ChooseEnzymesDraft {
  const catalogSource = catalogSourceFromSettings(settings)
  const base: ChooseEnzymesDraft = {
    selectedNames: settings.set === 'custom' ? [...settings.selectedNames] : settings.set === 'type-iis' ? enzymeNamesForStandardSet('type-iis', {}) : [],
    sourceSet: catalogSource,
    query: '',
    criteriaEnabled: settings.set !== 'custom' && settings.set !== 'type-iis',
    criteriaSourceSet: catalogSource,
    cutLocation: 'anywhere',
    cutCountMode: 'exact',
    cutCountAtLeast: 0,
    cutCountExact: 1,
    cutCountRangeMin: 1,
    cutCountRangeMax: 2,
    cutCountScope: 'entire',
    overhang: 'blunt-or-sticky',
    recognitionMin: 4,
    recognitionMax: 9,
  }

  if (settings.set === 'all' || settings.set === 'nonredundant' || settings.set === 'supplier') {
    return {
      ...base,
      cutCountMode: 'at-least',
      cutCountAtLeast: 0,
      recognitionMin: 4,
      recognitionMax: 9,
    }
  }
  if (settings.set === 'unique') {
    return { ...base, cutCountMode: 'exact', cutCountExact: 1 }
  }
  if (settings.set === 'unique-dual') {
    return {
      ...base,
      cutCountMode: 'range',
      cutCountRangeMin: 1,
      cutCountRangeMax: 2,
    }
  }
  if (settings.set === 'six-plus') {
    return {
      ...base,
      cutCountMode: 'at-least',
      cutCountAtLeast: 1,
      recognitionMin: 6,
      recognitionMax: 9,
    }
  }
  if (settings.set === 'unique-six-plus') {
    return {
      ...base,
      cutCountMode: 'exact',
      cutCountExact: 1,
      recognitionMin: 6,
      recognitionMax: 9,
    }
  }
  return { ...base, criteriaEnabled: false }
}

export function chooseEnzymesCriteriaFromDraft(draft: ChooseEnzymesDraft): ChooseEnzymesCriteria {
  return {
    sourceSet: draft.criteriaSourceSet,
    cutLocation: draft.cutLocation,
    cutCountMode: draft.cutCountMode,
    cutCountAtLeast: draft.cutCountAtLeast,
    cutCountExact: draft.cutCountExact,
    cutCountRangeMin: draft.cutCountRangeMin,
    cutCountRangeMax: draft.cutCountRangeMax,
    cutCountScope: draft.cutCountScope,
    overhang: draft.overhang,
    recognitionMin: draft.recognitionMin,
    recognitionMax: draft.recognitionMax,
  }
}

export function withAlignmentsVisibility(
  current: DisplaySettings,
  visible: boolean,
  mode?: DnaAlignmentMode,
): DisplaySettings {
  const { linearBeforeAlignments, ...alignments } = current.alignments
  if (visible) {
    return {
      ...current,
      alignments: {
        ...alignments,
        visible: true,
        mode: mode ?? alignments.mode,
        linearBeforeAlignments: current.alignments.visible ? linearBeforeAlignments : current.mapView.linear,
      },
      mapView: { ...current.mapView, linear: true, zoom: false },
    }
  }
  return {
    ...current,
    alignments: { ...alignments, visible: false },
    mapView: current.alignments.visible && linearBeforeAlignments !== undefined
      ? { ...current.mapView, linear: linearBeforeAlignments }
      : current.mapView,
  }
}
