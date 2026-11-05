import { shouldStartWithEnzymesHidden, type AppPreferences } from '../../domain/appPreferences'
import type { SequenceRecord } from '../../domain/types'
import type { DisplaySettings } from '../sequence'
import { initialDisplaySettings, mapViewLinearForTopology } from './displaySettings'

export function applyDisplaySectionPatch<Key extends keyof DisplaySettings>(
  current: DisplaySettings,
  key: Key,
  patch: Partial<DisplaySettings[Key]>,
): DisplaySettings {
  return {
    ...current,
    [key]: {
      ...current[key],
      ...patch,
    },
  }
}

export function planDefaultMapViewForTopology(
  current: DisplaySettings,
  topology: SequenceRecord['topology'],
  sequenceLength?: number,
  appPreferences?: AppPreferences,
): DisplaySettings {
  const next: DisplaySettings = {
    ...current,
    mapView: {
      ...current.mapView,
      linear: mapViewLinearForTopology(topology),
    },
  }
  if (typeof sequenceLength === 'number') {
    next.enzymes = {
      ...current.enzymes,
      visible: !shouldStartWithEnzymesHidden(sequenceLength, appPreferences),
    }
  }
  return next
}

export function planBootDisplaySettings(
  topology: SequenceRecord['topology'],
  options: { openedFromHandoff: boolean; sequenceLength: number },
): DisplaySettings {
  const base = initialDisplaySettings(topology)
  if (!options.openedFromHandoff) return base
  return applyDisplaySectionPatch(base, 'enzymes', {
    visible: !shouldStartWithEnzymesHidden(options.sequenceLength),
  })
}

export function planToggleFeatureVisibility(current: DisplaySettings): DisplaySettings {
  return applyDisplaySectionPatch(current, 'features', { visible: !current.features.visible })
}

export function planToggleFeatureLabelVisibility(current: DisplaySettings): DisplaySettings {
  return applyDisplaySectionPatch(current, 'features', { labelsVisible: !current.features.labelsVisible })
}

export function planToggleProteinColors(current: DisplaySettings): DisplaySettings {
  return applyDisplaySectionPatch(current, 'proteinColors', { enabled: !current.proteinColors.enabled })
}

export function planToggleProteinVisualControls(
  current: DisplaySettings,
  activeTab: 'Map' | 'Sequence' | string,
): DisplaySettings {
  if (current.alignments.visible) {
    return applyDisplaySectionPatch(current, 'proteinAlignmentVisual', {
      panelOpen: !current.proteinAlignmentVisual.panelOpen,
    })
  }
  if (activeTab === 'Map') {
    return applyDisplaySectionPatch(current, 'proteinMapVisual', {
      panelOpen: !current.proteinMapVisual.panelOpen,
    })
  }
  return applyDisplaySectionPatch(current, 'proteinSequenceVisual', {
    panelOpen: !current.proteinSequenceVisual.panelOpen,
  })
}

export function planHideAlignmentsForMemberSequenceView(current: DisplaySettings): DisplaySettings {
  return applyDisplaySectionPatch(current, 'alignments', { visible: false })
}

export function planProteinAlignmentDisplayPatch(
  current: DisplaySettings,
  updater: (current: DisplaySettings) => Partial<DisplaySettings>,
): DisplaySettings {
  return { ...current, ...updater(current) }
}
