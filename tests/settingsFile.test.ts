import { describe, expect, it } from 'vitest'
import { defaultEnzymePreferences } from '../src/domain/enzymePreferences'
import {
  exportSettingsJson,
  isSettingsFile,
  parseSettingsJson,
  pickChangedDeep,
} from '../src/domain/settingsFile'
import { parseDatabaseUiSettings } from '../src/storage/databaseUiPrefs'

const defaultDisplay = {
  enzymes: { visible: true, set: 'unique-six-plus', selectedNames: ['EcoRI', 'BamHI'] },
  proteinColors: {
    enabled: true,
    mode: 'class',
    classPalette: { nonpolar: '#dbeafe', polar: '#dcfce7' },
    residuePalette: { A: '#dbeafe', R: '#ede9fe' },
  },
  circularVisual: { panelOpen: false, outsideLabelFontSizePx: 12 },
  proteinMapVisual: { panelOpen: false, featureHeightPx: 16 },
  sequenceVisual: { panelOpen: false, sequenceFontSizePx: 12 },
}

describe('settings file', () => {
  it('omits unchanged display settings and ephemeral panelOpen flags', () => {
    const current = {
      ...defaultDisplay,
      circularVisual: { panelOpen: true, outsideLabelFontSizePx: 14 },
      proteinMapVisual: { panelOpen: true, featureHeightPx: 16 },
      sequenceVisual: { panelOpen: true, sequenceFontSizePx: 12 },
    }
    const patch = pickChangedDeep(current, defaultDisplay)
    expect(patch).toEqual({
      circularVisual: { outsideLabelFontSizePx: 14 },
    })
  })

  it('exports settings without plasmid/record data', () => {
    const json = exportSettingsJson({
      displaySettings: {
        ...defaultDisplay,
        sequenceVisual: { panelOpen: false, sequenceFontSizePx: 16 },
      },
      defaultDisplaySettings: defaultDisplay,
      enzymePreferences: { ...defaultEnzymePreferences, italicizeNames: true },
      userCommonFeatures: [{ id: 'cf-1', name: 'Tag', type: 'CDS', sequence: 'ATG' } as never],
      customMwLadders: [
        {
          id: 'custom__demo',
          name: 'Demo ladder',
          supplier: 'Custom',
          preferredUnits: 'bp',
          concentration: null,
          url: null,
          isDefault: false,
          fragments: [{ lengthBp: 500, mass: 1, format: 'normal' }],
        },
      ],
      mwLadderFavorites: { favoriteIds: ['custom__demo', '1kb-plus'] },
    })
    const parsed = JSON.parse(json)
    expect(parsed.kind).toBe('vibegene-settings')
    expect(parsed.record).toBeUndefined()
    expect(parsed.displaySettings.sequenceVisual.sequenceFontSizePx).toBe(16)
    expect(parsed.enzymePreferences.italicizeNames).toBe(true)
    expect(parsed.userCommonFeatures).toHaveLength(1)
    expect(parsed.customMwLadders).toHaveLength(1)
    expect(parsed.mwLadderFavorites.favoriteIds).toEqual(['custom__demo', '1kb-plus'])
    expect(isSettingsFile(parsed)).toBe(true)
  })

  it('round-trips through parseSettingsJson', () => {
    const json = exportSettingsJson({
      displaySettings: {
        ...defaultDisplay,
        enzymes: { ...defaultDisplay.enzymes, set: 'all' },
      },
      defaultDisplaySettings: defaultDisplay,
      enzymePreferences: defaultEnzymePreferences,
    })
    const settings = parseSettingsJson(json)
    expect(settings.kind).toBe('vibegene-settings')
    expect(settings.displaySettings).toEqual({ enzymes: { set: 'all' } })
    expect(settings.enzymePreferences).toBeUndefined()
  })

  it('round-trips protein color mode and exact class/residue palettes', () => {
    const json = exportSettingsJson({
      displaySettings: {
        ...defaultDisplay,
        proteinColors: {
          enabled: true,
          mode: 'residue',
          classPalette: { nonpolar: '#010203', polar: '#dcfce7' },
          residuePalette: { A: '#111111', R: '#abcdef' },
        },
      },
      defaultDisplaySettings: defaultDisplay,
      enzymePreferences: defaultEnzymePreferences,
    })
    expect(parseSettingsJson(json).displaySettings).toEqual({
      proteinColors: {
        mode: 'residue',
        classPalette: { nonpolar: '#010203' },
        residuePalette: { A: '#111111', R: '#abcdef' },
      },
    })
  })

  it('round-trips saved enzyme sets through settings export/import', () => {
    const preferences = {
      ...defaultEnzymePreferences,
      savedEnzymeSets: [{ id: 'saved-1', name: 'My Cutters', enzymeNames: ['EcoRI', 'BamHI'] }],
    }
    const json = exportSettingsJson({
      displaySettings: defaultDisplay,
      defaultDisplaySettings: defaultDisplay,
      enzymePreferences: preferences,
    })
    const settings = parseSettingsJson(json)
    expect(settings.enzymePreferences?.savedEnzymeSets).toEqual([
      { id: 'saved-1', name: 'My Cutters', enzymeNames: ['BamHI', 'EcoRI'] },
    ])
  })

  it('round-trips custom enzyme priority order through settings export/import', () => {
    const preferences = {
      ...defaultEnzymePreferences,
      priorityOrder: ['NotI', 'EcoRI', 'BamHI'],
    }
    const json = exportSettingsJson({
      displaySettings: defaultDisplay,
      defaultDisplaySettings: defaultDisplay,
      enzymePreferences: preferences,
    })
    const settings = parseSettingsJson(json)
    expect(settings.enzymePreferences?.priorityOrder).toEqual(['NotI', 'EcoRI', 'BamHI'])
  })

  it('round-trips database UI column order and widths', () => {
    const json = exportSettingsJson({
      displaySettings: defaultDisplay,
      defaultDisplaySettings: defaultDisplay,
      enzymePreferences: defaultEnzymePreferences,
      databaseUi: {
        fileColumnOrder: ['folder', 'name', 'tags', 'updated', 'size', 'actions'],
        fileColumnWidths: { name: 300 },
        primerColumnOrder: ['sequence', 'name', 'length', 'tm', 'gc', 'tags', 'files', 'actions'],
        primerColumnWidths: { sequence: 400 },
      },
    })
    const databaseUi = parseDatabaseUiSettings(parseSettingsJson(json).databaseUi)
    expect(databaseUi?.fileColumnOrder).toEqual([
      'folder',
      'size',
      'fileSize',
      'name',
      'format',
      'tags',
      'updated',
      'actions',
    ])
    expect(databaseUi?.primerColumnOrder?.[0]).toBe('sequence')
    expect(databaseUi?.fileColumnWidths?.name).toBe(300)
    expect(databaseUi?.primerColumnWidths?.sequence).toBe(400)
  })

  it('normalizes unknown database UI columns out of settings', () => {
    const json = JSON.stringify({
      kind: 'vibegene-settings',
      schemaVersion: 1,
      databaseUi: {
        fileColumnOrder: ['name', 'bogus', 'folder', 'name', 'tags', 'updated', 'size', 'actions'],
      },
    })
    const databaseUi = parseDatabaseUiSettings(parseSettingsJson(json).databaseUi)
    expect(databaseUi?.fileColumnOrder).toEqual([
      'name',
      'format',
      'folder',
      'size',
      'fileSize',
      'tags',
      'updated',
      'actions',
    ])
  })

  it('rejects project JSON / plain records', () => {
    expect(() => parseSettingsJson(JSON.stringify({ schemaVersion: 2, record: { name: 'x' } }))).toThrow(
      /settings file/i,
    )
  })
})
