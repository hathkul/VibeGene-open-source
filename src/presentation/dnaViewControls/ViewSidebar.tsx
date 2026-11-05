import { Search } from 'lucide-react'
import { beginAlignmentProfileSession } from '../../domain/alignmentProfiler'
import { type EnzymePreferences, type SavedEnzymeSet } from '../../domain/enzymePreferences'
import { type SequenceRecord } from '../../domain/types'
import { MapExportButton } from '../map/MapExportButton'
import { FeatureLabelSidebarControl } from '../protein'
import {
  type DisplaySettings,
  type DnaAlignmentMode,
  type RestrictionSiteList,
  type SelectionRange,
  type UserStrandPaintTarget,
} from '../sequence'
import { withAlignmentsVisibility } from './enzymeHelpers'
import { EnzymeSidebarControl } from './EnzymeControls'
import { OrfSidebarControl } from './OrfSidebarControl'
import { PrimerSidebarControl } from './PrimerSidebarControl'
import { AminoAcidCodeSidebarControl, DnaColorSidebarControl } from './DnaColorControls'

export function ViewSidebar({
  id,
  settings,
  enzymePreferences,
  fileEnzymeSets = [],
  restrictionSites,
  parentalRestrictionSites,
  recordName,
  sequence,
  topology,
  construct,
  selectedRange,
  sequenceLength,
  sequencePane = false,
  showCircularVisualControls = false,
  showSequenceVisualControls = false,
  hidePrimersToggle = false,
  hideAlignmentsToggle = false,
  onChange,
  onToggleMapZoom,
  onEnzymeInfo,
  onPreferencesChange,
  onFileEnzymeSetsChange,
  onPaintStrandColor,
}: {
  id?: string
  settings: DisplaySettings
  enzymePreferences: EnzymePreferences
  fileEnzymeSets?: SavedEnzymeSet[]
  restrictionSites: RestrictionSiteList
  parentalRestrictionSites: RestrictionSiteList
  recordName: string
  sequence: string
  topology: SequenceRecord['topology']
  construct: SequenceRecord['construct']
  selectedRange: SelectionRange | null
  sequenceLength: number
  sequencePane?: boolean
  /** Map tab + circular map mode: show visual-controls toggle at sidebar bottom. */
  showCircularVisualControls?: boolean
  /** Sequence tab: show visual-controls toggle at sidebar bottom. */
  showSequenceVisualControls?: boolean
  hidePrimersToggle?: boolean
  hideAlignmentsToggle?: boolean
  onChange: (updater: (current: DisplaySettings) => DisplaySettings) => void
  /** Map tab: toggle magnifier zoom mode (forces linear). Also shown on the sequence pane. */
  onToggleMapZoom?: () => void
  onEnzymeInfo: (enzymeName: string) => void
  onPreferencesChange: (preferences: EnzymePreferences) => void
  onFileEnzymeSetsChange?: (sets: SavedEnzymeSet[]) => void
  onPaintStrandColor: (colorName: string, strandTarget: UserStrandPaintTarget) => void
}) {
  function updateSection<Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) {
    onChange((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }))
  }

  function toggleDnaAlignmentMode(mode: DnaAlignmentMode) {
    if (!settings.alignments.visible) beginAlignmentProfileSession()
    onChange((current) => {
      const alreadyVisible = current.alignments.visible && (current.alignments.mode ?? 'trace') === mode
      return withAlignmentsVisibility(current, !alreadyVisible, mode)
    })
  }

  return (
    <aside id={id} className="view-sidebar" aria-label="Display controls">
      <EnzymeSidebarControl
        settings={settings}
        enzymePreferences={enzymePreferences}
        fileEnzymeSets={fileEnzymeSets}
        restrictionSites={restrictionSites}
        parentalRestrictionSites={parentalRestrictionSites}
        recordName={recordName}
        sequence={sequence}
        topology={topology}
        construct={construct}
        selectedRange={selectedRange}
        updateSection={updateSection}
        onEnzymeInfo={onEnzymeInfo}
        onPreferencesChange={onPreferencesChange}
        onFileEnzymeSetsChange={onFileEnzymeSetsChange}
      />

      <button
        type="button"
        className={`sidebar-tool-button sidebar-feature-button ${settings.features.visible ? 'is-active' : ''}`}
        title={settings.features.visible ? 'Hide features' : 'Show features'}
        aria-pressed={settings.features.visible}
        onClick={() => updateSection('features', { visible: !settings.features.visible })}
      >
        <img src="/feature-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>

      {!hidePrimersToggle && <PrimerSidebarControl settings={settings} updateSection={updateSection} />}

      <OrfSidebarControl settings={settings} updateSection={updateSection} />

      <DnaColorSidebarControl
        settings={settings}
        updateSection={updateSection}
        selectedRange={selectedRange}
        sequenceLength={sequenceLength}
        onPaintStrandColor={onPaintStrandColor}
      />

      {sequencePane ? <AminoAcidCodeSidebarControl settings={settings} updateSection={updateSection} /> : null}

      <FeatureLabelSidebarControl settings={settings} updateSection={updateSection} />

      <button
        type="button"
        className={`sidebar-tool-button sidebar-locations-button ${settings.enzymes.showPositions ? 'is-active' : ''}`}
        title={settings.enzymes.showPositions ? 'Hide enzyme nucleotide numbers' : 'Show enzyme nucleotide numbers'}
        aria-pressed={settings.enzymes.showPositions}
        onClick={() => updateSection('enzymes', { showPositions: !settings.enzymes.showPositions })}
      >
        <img src="/locations-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>

      <button
        type="button"
        className={`sidebar-tool-button sidebar-linear-map-button ${settings.mapView.linear ? 'is-active' : ''}`}
        title={settings.mapView.linear ? 'Show circular map' : 'Show linear map'}
        aria-pressed={settings.mapView.linear}
        onClick={() => {
          if (settings.mapView.zoom && settings.mapView.linear) {
            // Leaving linear while zoomed also exits magnifier mode.
            onChange((current) => ({
              ...current,
              mapView: { ...current.mapView, linear: false, zoom: false },
            }))
            return
          }
          onChange((current) => ({
            ...current,
            alignments: { ...current.alignments, linearBeforeAlignments: undefined },
            mapView: { ...current.mapView, linear: !current.mapView.linear },
          }))
        }}
      >
        <img src="/linear-map-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>

      {onToggleMapZoom ? (
        <button
          type="button"
          className={`sidebar-tool-button sidebar-map-zoom-button ${settings.mapView.zoom ? 'is-active' : ''}`}
          title={settings.mapView.zoom ? 'Exit zoom' : 'Zoom sequence / map'}
          aria-pressed={settings.mapView.zoom}
          onClick={onToggleMapZoom}
        >
          <Search className="sidebar-tool-icon" size={20} strokeWidth={1.85} aria-hidden />
        </button>
      ) : null}

      {!hideAlignmentsToggle && (
        <>
          <button
            type="button"
            className={`sidebar-tool-button sidebar-alignments-button ${settings.alignments.visible && (settings.alignments.mode ?? 'trace') === 'trace' ? 'is-active' : ''}`}
            title={settings.alignments.visible && (settings.alignments.mode ?? 'trace') === 'trace'
              ? 'Hide sequence trace alignments'
              : 'Show sequence trace alignments'}
            aria-pressed={settings.alignments.visible && (settings.alignments.mode ?? 'trace') === 'trace'}
            onClick={() => toggleDnaAlignmentMode('trace')}
          >
            <img src="/alignments-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
          </button>
          <button
            type="button"
            className={`sidebar-tool-button sidebar-comparative-alignments-button ${settings.alignments.visible && settings.alignments.mode === 'comparative' ? 'is-active' : ''}`}
            title={settings.alignments.visible && settings.alignments.mode === 'comparative'
              ? 'Hide comparative alignments'
              : 'Show comparative alignments'}
            aria-pressed={settings.alignments.visible && settings.alignments.mode === 'comparative'}
            onClick={() => toggleDnaAlignmentMode('comparative')}
          >
            <img src="/protein-alignments-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
          </button>
        </>
      )}

      {!sequencePane && (showCircularVisualControls || settings.mapView.zoom || settings.mapView.linear) ? (
        <>
          <div className="sidebar-spacer" aria-hidden />
          {showCircularVisualControls ? (
            <button
              type="button"
              className={`sidebar-tool-button sidebar-visual-controls-button ${settings.circularVisual.panelOpen ? 'is-active' : ''}`}
              title={settings.circularVisual.panelOpen ? 'Hide visual controls' : 'Show visual controls'}
              aria-pressed={settings.circularVisual.panelOpen}
              onClick={() =>
                updateSection('circularVisual', {
                  panelOpen: !settings.circularVisual.panelOpen,
                  ...(settings.circularVisual.panelOpen ? { manualLabelPlacement: false } : {}),
                })
              }
            >
              <img src="/vis-settings-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
            </button>
          ) : null}
          <MapExportButton
            recordName={recordName}
            title={
              settings.mapView.zoom
                ? 'Export zoomed map'
                : settings.mapView.linear
                  ? 'Export linear map'
                  : 'Export circular map'
            }
          />
        </>
      ) : null}

      {showSequenceVisualControls ? (
        <>
          <div className="sidebar-spacer" aria-hidden />
          <button
            type="button"
            className={`sidebar-tool-button sidebar-visual-controls-button ${settings.sequenceVisual.panelOpen ? 'is-active' : ''}`}
            title={settings.sequenceVisual.panelOpen ? 'Hide visual controls' : 'Show visual controls'}
            aria-pressed={settings.sequenceVisual.panelOpen}
            onClick={() => updateSection('sequenceVisual', { panelOpen: !settings.sequenceVisual.panelOpen })}
          >
            <img src="/vis-settings-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
          </button>
        </>
      ) : null}
    </aside>
  )
}
