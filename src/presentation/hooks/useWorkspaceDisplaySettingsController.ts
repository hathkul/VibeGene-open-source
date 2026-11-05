import { useCallback } from 'react'
import { readAppPreferences } from '../../domain/appPreferences'
import type { SequenceRecord } from '../../domain/types'
import {
  applyDisplaySectionPatch,
  planDefaultMapViewForTopology,
  planHideAlignmentsForMemberSequenceView,
  planProteinAlignmentDisplayPatch,
  planToggleFeatureLabelVisibility,
  planToggleFeatureVisibility,
  planToggleProteinColors,
  planToggleProteinVisualControls,
} from '../cloning/displaySettingsTransitionPlan'
import type { DisplaySettings, WorkspaceTab } from '../sequence'

export type WorkspaceDisplaySettingsControllerOptions = {
  setDisplaySettings: (updater: (current: DisplaySettings) => DisplaySettings) => void
  activeTab: WorkspaceTab
  readAppPreferences?: () => ReturnType<typeof readAppPreferences>
}

/** Owns display-settings section patches, topology map defaults, and view-menu visual toggles. */
export function useWorkspaceDisplaySettingsController(options: WorkspaceDisplaySettingsControllerOptions) {
  const readPreferences = options.readAppPreferences ?? readAppPreferences

  const updateDisplaySection = useCallback(<Key extends keyof DisplaySettings>(
    key: Key,
    patch: Partial<DisplaySettings[Key]>,
  ) => {
    options.setDisplaySettings((current) => applyDisplaySectionPatch(current, key, patch))
  }, [options])

  const applyDefaultMapViewForTopology = useCallback((
    topology: SequenceRecord['topology'],
    sequenceLength?: number,
  ) => {
    options.setDisplaySettings((current) =>
      planDefaultMapViewForTopology(current, topology, sequenceLength, readPreferences()),
    )
  }, [options, readPreferences])

  const toggleFeaturesVisibility = useCallback(() => {
    options.setDisplaySettings((current) => planToggleFeatureVisibility(current))
  }, [options])

  const toggleFeatureLabelsVisibility = useCallback(() => {
    options.setDisplaySettings((current) => planToggleFeatureLabelVisibility(current))
  }, [options])

  const toggleProteinColors = useCallback(() => {
    options.setDisplaySettings((current) => planToggleProteinColors(current))
  }, [options])

  const toggleProteinVisualControls = useCallback(() => {
    options.setDisplaySettings((current) => planToggleProteinVisualControls(current, options.activeTab))
  }, [options])

  const hideAlignmentsForMemberSequenceView = useCallback(() => {
    options.setDisplaySettings((current) => planHideAlignmentsForMemberSequenceView(current))
  }, [options])

  const applyProteinAlignmentDisplayPatch = useCallback((
    updater: (current: DisplaySettings) => Partial<DisplaySettings>,
  ) => {
    options.setDisplaySettings((current) => planProteinAlignmentDisplayPatch(current, updater))
  }, [options])

  return {
    updateDisplaySection,
    applyDefaultMapViewForTopology,
    toggleFeaturesVisibility,
    toggleFeatureLabelsVisibility,
    toggleProteinColors,
    toggleProteinVisualControls,
    hideAlignmentsForMemberSequenceView,
    applyProteinAlignmentDisplayPatch,
  }
}
