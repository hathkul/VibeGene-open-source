import { normalizePrimerHybridizationParams } from '../../domain/primerHybridization'
import { loadPersistedVisualSettings } from '../../domain/displaySettingsPreferences'
import { normalizeProteinColorMode, defaultDisplaySettings, type DisplaySettings } from '../sequence'
import type { ProteinColorMode, ProteinResidueColorPalette } from '../sequence'
import type { SequenceRecord } from '../../domain/types'

/** Linear sequences open on the linear map; circular sequences keep the circular map. */
export function mapViewLinearForTopology(topology: SequenceRecord['topology']) {
  return topology === 'linear'
}

export function displaySettingsForTopology(topology: SequenceRecord['topology']): DisplaySettings {
  return {
    ...defaultDisplaySettings,
    mapView: {
      ...defaultDisplaySettings.mapView,
      linear: mapViewLinearForTopology(topology),
    },
  }
}


/** Topology defaults plus any visual prefs saved in localStorage. */
export function initialDisplaySettings(topology: SequenceRecord['topology']): DisplaySettings {
  return mergeDisplaySettingsFromProject(loadPersistedVisualSettings(), topology)
}

/** Deep-merge saved project visual settings onto topology defaults. */
export function mergeDisplaySettingsFromProject(partial: unknown, topology: SequenceRecord['topology']): DisplaySettings {
  const base = displaySettingsForTopology(topology)
  if (!partial || typeof partial !== 'object') return base
  const saved = partial as Partial<DisplaySettings>
  const savedProteinColors = saved.proteinColors as (Omit<Partial<DisplaySettings['proteinColors']>, 'mode'> & {
    mode?: ProteinColorMode | 'custom'
    palette?: Partial<ProteinResidueColorPalette>
  }) | undefined
  const savedProteinColorMode = normalizeProteinColorMode(savedProteinColors?.mode)
  return {
    ...base,
    ...saved,
    enzymes: { ...base.enzymes, ...saved.enzymes },
    features: { ...base.features, ...saved.features },
    primers: {
      ...base.primers,
      ...saved.primers,
      hybridization: normalizePrimerHybridizationParams(
        saved.primers?.hybridization ?? base.primers.hybridization,
      ),
    },
    orfs: { ...base.orfs, ...saved.orfs },
    dnaColors: {
      ...base.dnaColors,
      ...saved.dnaColors,
      palette: { ...base.dnaColors.palette, ...saved.dnaColors?.palette },
    },
    proteinColors: {
      ...base.proteinColors,
      ...savedProteinColors,
      mode: savedProteinColorMode,
      residuePalette: {
        ...base.proteinColors.residuePalette,
        ...savedProteinColors?.palette,
        ...savedProteinColors?.residuePalette,
      },
      classPalette: {
        ...base.proteinColors.classPalette,
        ...savedProteinColors?.classPalette,
      },
    },
    proteinBonds: { ...base.proteinBonds, ...saved.proteinBonds },
    alignments: { ...base.alignments, ...saved.alignments },
    mapView: { ...base.mapView, ...saved.mapView },
    sequenceView: { ...base.sequenceView, ...saved.sequenceView },
    labelRouting: { ...base.labelRouting, ...saved.labelRouting },
    circularVisual: { ...base.circularVisual, ...saved.circularVisual },
    proteinMapVisual: { ...base.proteinMapVisual, ...saved.proteinMapVisual },
    proteinSequenceVisual: { ...base.proteinSequenceVisual, ...saved.proteinSequenceVisual },
    proteinAlignmentVisual: { ...base.proteinAlignmentVisual, ...saved.proteinAlignmentVisual },
    sequenceVisual: { ...base.sequenceVisual, ...saved.sequenceVisual },
  }
}
