import { useCallback } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { SettingsEnvelope } from '../../domain/settingsFile'
import type { DisplaySettings } from '../sequence'
import type { EnzymePreferences } from '../../domain/enzymePreferences'
import type { EnzymeTabPositionMode } from '../sequence'

type SettingsPersistenceOptions = {
  record: SequenceRecord
  displaySettings: DisplaySettings
  defaultDisplaySettings: DisplaySettings
  setDisplaySettings: (updater: (current: DisplaySettings) => DisplaySettings) => void
  enzymePreferences: EnzymePreferences
  setEnzymePreferences: (preferences: EnzymePreferences) => void
  setEnzymeTabPositionMode: (mode: EnzymeTabPositionMode) => void
  normalizeEnzymePreferences: (preferences: Partial<EnzymePreferences>) => EnzymePreferences
  saveEnzymePreferences: (preferences: EnzymePreferences) => void
  mergeDisplaySettingsFromProject: (settings: unknown, topology: SequenceRecord['topology']) => DisplaySettings
  persistVisualSettingsFromPatch: (settings: unknown, options?: { replaceProteinColors?: boolean }) => void
  savePersistedVisualSettings: (settings: DisplaySettings, defaults: DisplaySettings, scope: 'map' | 'sequence') => void
  clearPersistedVisualSettings: (scope: 'map' | 'sequence') => void
  mergeUserCommonFeatures: (features: NonNullable<SettingsEnvelope['userCommonFeatures']>) => void
  mergeCustomMwLadders: (ladders: NonNullable<SettingsEnvelope['customMwLadders']>) => void
  listCustomMwLadders: () => NonNullable<SettingsEnvelope['customMwLadders']>
  saveMwLadderFavorites: (favorites: NonNullable<SettingsEnvelope['mwLadderFavorites']>, ladders: NonNullable<SettingsEnvelope['customMwLadders']>) => void
  listUserCommonFeatures: () => NonNullable<SettingsEnvelope['userCommonFeatures']>
  loadMwLadderFavorites: () => NonNullable<SettingsEnvelope['mwLadderFavorites']>
  readDatabaseUiSettingsForExport: () => Record<string, unknown> | undefined
  parseDatabaseUiSettings: (settings: unknown) => unknown
  applyDatabaseUiSettings: (settings: unknown) => boolean
  exportSettingsJson: (settings: {
    displaySettings: unknown
    defaultDisplaySettings: unknown
    enzymePreferences: EnzymePreferences
    userCommonFeatures?: NonNullable<SettingsEnvelope['userCommonFeatures']>
    customMwLadders?: NonNullable<SettingsEnvelope['customMwLadders']>
    mwLadderFavorites?: NonNullable<SettingsEnvelope['mwLadderFavorites']>
    databaseUi?: Record<string, unknown>
  }) => string
  downloadText: (fileName: string, text: string, mimeType: string) => Promise<string | null>
  readFileText: (file: File) => Promise<string>
  parseSettingsJson: (text: string) => SettingsEnvelope
  setStatus: (status: string) => void
}

/** Owns settings-file import/export and visual-settings persistence through injected ports. */
export function useSettingsPersistenceController(options: SettingsPersistenceOptions) {
  const handleDownloadSettingsFile = useCallback(() => {
    void options.downloadText(
      'vibegene-settings.json',
      options.exportSettingsJson({
        displaySettings: options.displaySettings,
        defaultDisplaySettings: options.defaultDisplaySettings,
        enzymePreferences: options.enzymePreferences,
        userCommonFeatures: options.listUserCommonFeatures(),
        customMwLadders: options.listCustomMwLadders(),
        mwLadderFavorites: options.loadMwLadderFavorites(),
        databaseUi: options.readDatabaseUiSettingsForExport(),
      }),
      'application/json',
    )
    options.setStatus('Downloaded VibeGene settings file.')
  }, [options])

  const saveMapVisualSettings = useCallback(() => {
    options.savePersistedVisualSettings(options.displaySettings, options.defaultDisplaySettings, 'map')
    options.setDisplaySettings((current) => ({
      ...current,
      circularVisual: { ...current.circularVisual, panelOpen: false, manualLabelPlacement: false },
      proteinMapVisual: { ...current.proteinMapVisual, panelOpen: false },
    }))
    options.setStatus('Saved map visual settings.')
  }, [options])

  const saveSequenceVisualSettings = useCallback(() => {
    options.savePersistedVisualSettings(options.displaySettings, options.defaultDisplaySettings, 'sequence')
    options.setDisplaySettings((current) => ({
      ...current,
      sequenceVisual: { ...current.sequenceVisual, panelOpen: false },
      proteinSequenceVisual: { ...current.proteinSequenceVisual, panelOpen: false },
      proteinAlignmentVisual: { ...current.proteinAlignmentVisual, panelOpen: false },
    }))
    options.setStatus('Saved sequence visual settings.')
  }, [options])

  const revertMapVisualSettings = useCallback(() => {
    options.setDisplaySettings((current) => ({
      ...current,
      circularVisual: { ...options.defaultDisplaySettings.circularVisual, panelOpen: true },
      proteinMapVisual: { ...options.defaultDisplaySettings.proteinMapVisual, panelOpen: true },
      labelRouting: { ...options.defaultDisplaySettings.labelRouting },
    }))
    options.clearPersistedVisualSettings('map')
    options.setStatus('Reverted map visual settings to defaults.')
  }, [options])

  const revertSequenceVisualSettings = useCallback(() => {
    options.setDisplaySettings((current) => ({
      ...current,
      sequenceVisual: { ...options.defaultDisplaySettings.sequenceVisual, panelOpen: true },
      proteinSequenceVisual: { ...options.defaultDisplaySettings.proteinSequenceVisual, panelOpen: current.proteinSequenceVisual.panelOpen || !current.alignments.visible },
      proteinAlignmentVisual: { ...options.defaultDisplaySettings.proteinAlignmentVisual, panelOpen: current.proteinAlignmentVisual.panelOpen || current.alignments.visible },
    }))
    options.clearPersistedVisualSettings('sequence')
    options.setStatus('Reverted sequence visual settings to defaults.')
  }, [options])

  const applyLoadedSettings = useCallback((settings: SettingsEnvelope, fileName: string) => {
    const extras: string[] = []
    if (settings.displaySettings != null) {
      options.setDisplaySettings(() => options.mergeDisplaySettingsFromProject(settings.displaySettings, options.record.topology))
      options.persistVisualSettingsFromPatch(settings.displaySettings, { replaceProteinColors: true })
      extras.push('visual settings')
    }
    if (settings.enzymePreferences) {
      const next = options.normalizeEnzymePreferences(settings.enzymePreferences)
      options.setEnzymePreferences(next)
      options.saveEnzymePreferences(next)
      options.setEnzymeTabPositionMode(next.defaultTab)
      extras.push('enzyme preferences')
    }
    if (settings.userCommonFeatures?.length) {
      options.mergeUserCommonFeatures(settings.userCommonFeatures)
      extras.push(`${settings.userCommonFeatures.length} common features`)
    }
    if (settings.customMwLadders?.length) {
      options.mergeCustomMwLadders(settings.customMwLadders)
      extras.push(`${settings.customMwLadders.length} custom MW markers`)
    }
    if (settings.mwLadderFavorites) {
      options.saveMwLadderFavorites(settings.mwLadderFavorites, options.listCustomMwLadders())
      extras.push('MW marker favorites')
    }
    if (options.applyDatabaseUiSettings(options.parseDatabaseUiSettings(settings.databaseUi))) extras.push('database columns')
    options.setStatus(extras.length ? `Loaded settings from ${fileName} (${extras.join(', ')}).` : `Loaded ${fileName} (no settings changes).`)
  }, [options])

  const handleLoadSettingsFile = useCallback(async (file: File) => {
    try {
      const text = await options.readFileText(file)
      const parsed = options.parseSettingsJson(text)
      applyLoadedSettings(parsed, file.name)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : `Could not load settings from ${file.name}.`)
    }
  }, [options, applyLoadedSettings])

  return { handleDownloadSettingsFile, saveMapVisualSettings, saveSequenceVisualSettings, revertMapVisualSettings, revertSequenceVisualSettings, applyLoadedSettings, handleLoadSettingsFile }
}
