/* eslint-disable react-hooks/exhaustive-deps, react-hooks/preserve-manual-memoization, react-hooks/refs, react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from 'react'
import { EnzymeInfoDialog } from '../../EnzymeInfoDialog'
import { findRestrictionSites } from '../../domain/enzymes'
import { enzymePoolForSettings, loadEnzymePreferences, saveEnzymePreferences, type EnzymePreferences } from '../../domain/enzymePreferences'
import { getCachedOrfFeatures } from '../../domain/orfPrediction'
import { normalizePrimerHybridizationParams } from '../../domain/primerHybridization'
import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'
import { regeneratedEndRestrictionSites } from '../../domain/newFileFromSelection'
import { resolveDnaEnds } from '../../domain/dnaEnds'
import { resolveDisplayablePrimerSites } from '../../domain/primerSequenceLayout'
import { displayableRecordFeatures } from '../../domain/primerPaneEntries'
import { extractRange, featureBounds, gcContent, normalizeDna } from '../../domain/sequence'
import { overhangDescription } from '../../domain/enzymeCatalog'
import type { RestrictionSite, SequenceFeature } from '../../domain/types'
import { type TraceFileRecord } from '../../domain/traceTypes'
import type { CloningWorkspaceRenderArgs } from '../../cloningWorkspaceTypes'
import {
  CircularMapStage,
  MapZoomStrip,
  TrackMap,
  clampMapZoomRange,
  clampMapZoomRangeToSequence,
  mapZoomCaretPosition,
  mapZoomRangeFromSlider,
  mapZoomSliderSteps,
  mapZoomSliderValueFromWindow,
  mapZoomWindowFromSlider,
  initialMapZoomState,
  isRulerTrackFeature,
} from '../map'
import { restrictionSiteRange, siteKey } from '../map/mapPrimitives'
import {
  AminoAcidCodeSidebarControl,
  EnzymeSidebarControl,
  EnzymeSiteMinimap,
  EnzymeTabSetControl,
  OrfSidebarControl,
  ViewSidebar,
} from '../dnaViewControls'
import {
  SequenceWorkspace,
  defaultDisplaySettings,
  filterRestrictionSitesForDisplay,
  filterRestrictionSitesForEnzymeSet,
  formatThermoGc,
  formatThermoTemperature,
  isPrimerFeature,
  selectionLength,
  thermoMethodLabel,
  type DisplaySettings,
  type EnzymeTabPositionMode,
  type EnzymeTabSortDirection,
  type EnzymeTabSortMode,
  type SelectionRange,
} from '../sequence'
import { clearPersistedVisualSettings, savePersistedVisualSettings } from '../../domain/displaySettingsPreferences'
import { displaySettingsForTopology, initialDisplaySettings } from './displaySettings'
import { EnzymeTableSortHeader, groupRestrictionSitesByEnzyme, sortEnzymeTabRows } from './EnzymeTableSort'
export function CloningRecordWorkspace({
  record,
  title,
  selectedRange: controlledRange,
  cutStrandSelection,
  selectedSites,
  segmentHighlights,
  allowEnzymeSelect,
  includePrimersTab = false,
  showFeatureTranslations = false,
  allowPrimerSelect = false,
  selectedPrimerIds: controlledPrimerIds,
  primerFrameDisplayOverrides,
  disablePrimer3PrimerFrameRefinement = false,
  sequenceOnly = false,
  sequenceOnlySidebar = false,
  hideSequenceMinimap = false,
  singleRowSequence = false,
  selectionDetailsInStatus = false,
  initialTab,
  sequenceViewRange = null,
  primerHybridization,
  highlightMutagenicDnaBases = false,
  onRestrictionSelect,
  onPrimerSelect,
  onRangeSelect,
  onEnzymePickerSitesChange,
  initialEnzymeSet,
}: CloningWorkspaceRenderArgs) {
  type PreviewTab = 'Map' | 'Sequence' | 'Enzymes' | 'Primers'
  const [tab, setTab] = useState<PreviewTab>(sequenceOnly ? 'Sequence' : (initialTab ?? 'Map'))
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    const initial = initialDisplaySettings(record?.topology ?? 'circular')
    return {
      ...initial,
      enzymes: initialEnzymeSet ? { ...initial.enzymes, ...initialEnzymeSet } : initial.enzymes,
      primers: {
        ...defaultDisplaySettings.primers,
        visible: includePrimersTab,
        hybridization: normalizePrimerHybridizationParams(
          primerHybridization ?? defaultDisplaySettings.primers.hybridization,
        ),
      },
      alignments: { visible: false },
    }
  })
  const [mapZoomRange, setMapZoomRange] = useState<SelectionRange | null>(null)
  /** Slider thumb position is source of truth; window length is derived from it (avoids round-trip shiver). */
  const [mapZoomSlider, setMapZoomSlider] = useState(0)
  const mapZoomLinearBeforeRef = useRef<boolean | null>(null)
  const [enzymePreferences, setEnzymePreferences] = useState<EnzymePreferences>(() => loadEnzymePreferences())
  const [localRange, setLocalRange] = useState<SelectionRange | null>(null)
  const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
  const [localPrimerIds, setLocalPrimerIds] = useState<string[]>([])
  const [enzymeTabSortMode, setEnzymeTabSortMode] = useState<EnzymeTabSortMode>('name')
  const [enzymeTabSortDirection, setEnzymeTabSortDirection] = useState<EnzymeTabSortDirection>('asc')
  const [enzymeTabPositionMode, setEnzymeTabPositionMode] = useState<EnzymeTabPositionMode>('numbers')
  const [enzymeInfoName, setEnzymeInfoName] = useState<string | null>(null)
  const sequenceScrollRef = useRef<HTMLDivElement | null>(null)
  const noopTraces = useRef<TraceFileRecord[]>([]).current
  const selectedPrimerIds = controlledPrimerIds ?? localPrimerIds
  const activePrimerId = selectedPrimerIds[0] ?? selectedPrimerId
  const previewTab = sequenceOnly ? 'Sequence' : tab
  const sequencePaneViewRange =
    sequenceViewRange ?? (displaySettings.mapView.zoom ? mapZoomRange : null)
  useEffect(() => {
    if (sequenceOnly) setTab('Sequence')
  }, [sequenceOnly])
  useEffect(() => {
    if (!primerHybridization) return
    const hybridization = normalizePrimerHybridizationParams(primerHybridization)
    setDisplaySettings((current) => ({
      ...current,
      primers: { ...current.primers, hybridization },
    }))
  }, [primerHybridization])
  function setCloningDisplaySettings(updater: (current: DisplaySettings) => DisplaySettings) {
    setDisplaySettings((current) => {
      const next = updater(current)
      return {
        ...next,
        primers: includePrimersTab ? next.primers : { ...next.primers, visible: false },
        alignments: { visible: false },
      }
    })
  }
  useEffect(() => {
    if (!record) return
    setCloningDisplaySettings((current) => ({
      ...displaySettingsForTopology(record.topology),
      enzymes: current.enzymes,
      features: current.features,
      primers: includePrimersTab
        ? { ...defaultDisplaySettings.primers, visible: true, hybridization: current.primers.hybridization }
        : { ...current.primers, visible: false },
      orfs: { ...current.orfs, visible: false },
      circularVisual: current.circularVisual,
      proteinMapVisual: current.proteinMapVisual,
      proteinSequenceVisual: current.proteinSequenceVisual,
      proteinAlignmentVisual: current.proteinAlignmentVisual,
      sequenceVisual: current.sequenceVisual,
      labelRouting: current.labelRouting,
      dnaColors: current.dnaColors,
      sequenceView: current.sequenceView,
    }))
    setLocalRange(null)
    setSelectedPrimerId(null)
    setLocalPrimerIds([])
  }, [includePrimersTab, record?.id, record?.topology])
  const selectedRange = controlledRange ?? localRange
  const mapSelectedRange = selectedRange ?? cutStrandSelection?.forward ?? null
  const statusSelectionThermo = useMemo(() => {
    if (!selectionDetailsInStatus || !record || !selectedRange || selectedRange.start === selectedRange.end) return null
    return calculateAnnealTemperature(extractRange(record.sequence, selectedRange.start, selectedRange.end))
  }, [record, selectedRange, selectionDetailsInStatus])
  function toggleMapZoom() {
    if (!record) return
    if (displaySettings.mapView.zoom) {
      const restoreLinear = mapZoomLinearBeforeRef.current ?? displaySettings.mapView.linear
      mapZoomLinearBeforeRef.current = null
      setMapZoomRange(null)
      setMapZoomSlider(0)
      setCloningDisplaySettings((current) => ({
        ...current,
        mapView: { ...current.mapView, zoom: false, linear: restoreLinear },
      }))
      return
    }
    mapZoomLinearBeforeRef.current = displaySettings.mapView.linear
    const { range, slider } = initialMapZoomState(mapSelectedRange, record.sequence.length)
    setMapZoomRange(range)
    setMapZoomSlider(slider)
    setCloningDisplaySettings((current) => ({
      ...current,
      mapView: { ...current.mapView, zoom: true, linear: true },
    }))
  }
  function handleMapZoomSliderChange(value: number) {
    if (!record) return
    const length = record.sequence.length
    const caret = mapZoomCaretPosition(mapSelectedRange, length)
    const steps = mapZoomSliderSteps(length)
    const clamped = Math.max(0, Math.min(steps, Math.round(value)))
    setMapZoomSlider(clamped)
    setMapZoomRange(mapZoomRangeFromSlider(clamped, caret, length))
  }
  function handleMapZoomRangeChange(range: SelectionRange) {
    if (!record) return
    const length = record.sequence.length
    const next = clampMapZoomRange(range, length)
    setMapZoomRange(next)
    setMapZoomSlider((current) => {
      if (mapZoomWindowFromSlider(current, length) === next.end - next.start) return current
      return mapZoomSliderValueFromWindow(next.end - next.start, length)
    })
  }
  useEffect(() => {
    if (!record || !displaySettings.mapView.zoom) {
      setMapZoomRange(null)
      setMapZoomSlider(0)
      mapZoomLinearBeforeRef.current = null
      return
    }
    const length = record.sequence.length
    const seedRange = selectedRange ?? cutStrandSelection?.forward ?? null
    setMapZoomRange((current) => {
      if (!current) return initialMapZoomState(seedRange, length).range
      return clampMapZoomRangeToSequence(current, length)
    })
    setMapZoomSlider((current) => {
      const steps = mapZoomSliderSteps(length)
      return Math.max(0, Math.min(steps, current))
    })
  }, [displaySettings.mapView.zoom, record?.sequence.length])
  useEffect(() => {
    // Drop any local map/sequence drag so the digest fragment range stays authoritative.
    setLocalRange(null)
  }, [controlledRange?.start, controlledRange?.end, record?.id])
  const orfPredictionSettings = useMemo(
    () => ({
      mode: displaySettings.orfs.mode,
      minimumLengthAa: displaySettings.orfs.minimumLengthAa,
      requireStartCodon: displaySettings.orfs.requireStartCodon,
      startCodon: displaySettings.orfs.startCodon,
      geneticCode: displaySettings.orfs.geneticCode,
    }),
    [
      displaySettings.orfs.geneticCode,
      displaySettings.orfs.minimumLengthAa,
      displaySettings.orfs.mode,
      displaySettings.orfs.requireStartCodon,
      displaySettings.orfs.startCodon,
    ],
  )
  const cachedOrfFeatures = useMemo(() => {
    if (!record?.sequence || !displaySettings.orfs.visible) return []
    return getCachedOrfFeatures(record.sequence, orfPredictionSettings)
  }, [displaySettings.orfs.visible, orfPredictionSettings, record?.sequence])
  const highlightFeatures = useMemo<SequenceFeature[]>(() => {
    if (!segmentHighlights?.length) return []
    return segmentHighlights.map((segment, index) => {
      const rawLabel = (segment.label ?? `Part ${index + 1}`).trim()
      const name = rawLabel ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1) : `Part ${index + 1}`
      return {
        id: `cloning-highlight-${index}`,
        name,
        type: 'misc_feature',
        color: segment.color,
        mapTrack: 'ruler' as const,
        locations: [
          {
            start: segment.start,
            end: segment.end,
            strand: 'forward' as const,
          },
        ],
      }
    })
  }, [segmentHighlights])
  const displayAnnotationFeatures = useMemo(() => {
    if (!record) return []
    const visibleRecordFeatures = displayableRecordFeatures(record.features, {
      featuresVisible: displaySettings.features.visible,
      sgRnasVisible: displaySettings.primers.sgRnasVisible,
    })
    const withOrfs = displaySettings.orfs.visible
      ? [...visibleRecordFeatures, ...cachedOrfFeatures]
      : visibleRecordFeatures
    // Cloning/gel previews suppress CDS translation overlays among features.
    // Browse Common Features opts back in via showFeatureTranslations.
    if (showFeatureTranslations) return withOrfs
    return withOrfs.map((feature) =>
      feature.translateInSequenceView
        ? { ...feature, translateInSequenceView: false, translation: undefined }
        : feature,
    )
  }, [
    cachedOrfFeatures,
    displaySettings.features.visible,
    displaySettings.orfs.visible,
    displaySettings.primers.sgRnasVisible,
    record,
    showFeatureTranslations,
  ])
  const rulerRecordFeatures = useMemo(
    () => (record?.features ?? []).filter(isRulerTrackFeature),
    [record],
  )
  const mapAnnotationFeatures = useMemo(
    () => [
      ...displayAnnotationFeatures.filter((feature) => !isPrimerFeature(feature)),
      ...rulerRecordFeatures,
      ...highlightFeatures,
    ],
    [displayAnnotationFeatures, highlightFeatures, rulerRecordFeatures],
  )
  const activeEnzymePool = useMemo(
    () => enzymePoolForSettings(displaySettings.enzymes, enzymePreferences),
    [displaySettings.enzymes, enzymePreferences],
  )
  const parentalEnzymePool = useMemo(() => {
    const parentalSet = enzymePreferences.parentalSet === 'all' ? 'all' : 'nonredundant'
    return enzymePoolForSettings({ set: parentalSet, selectedNames: [], supplierSetId: null }, enzymePreferences)
  }, [enzymePreferences])
  const unionEnzymePool = useMemo(() => {
    const byName = new Map(activeEnzymePool.map((enzyme) => [enzyme.name, enzyme]))
    parentalEnzymePool.forEach((enzyme) => byName.set(enzyme.name, enzyme))
    return [...byName.values()]
  }, [activeEnzymePool, parentalEnzymePool])
  const allRestrictionSites = useMemo(() => {
    if (!record?.sequence || !displaySettings.enzymes.visible) return []
    return findRestrictionSites(record.sequence, unionEnzymePool, {
      construct: record.construct,
      topology: record.topology,
      annotateMethylation: true,
    })
  }, [displaySettings.enzymes.visible, record, unionEnzymePool])
  const activeEnzymeNames = useMemo(
    () => new Set(activeEnzymePool.map((enzyme) => enzyme.name)),
    [activeEnzymePool],
  )
  const parentalEnzymeNames = useMemo(
    () => new Set(parentalEnzymePool.map((enzyme) => enzyme.name)),
    [parentalEnzymePool],
  )
  const restrictionSites = useMemo(
    () => allRestrictionSites.filter((site) => activeEnzymeNames.has(site.enzyme.name)),
    [activeEnzymeNames, allRestrictionSites],
  )
  const parentalRestrictionSites = useMemo(
    () => allRestrictionSites.filter((site) => parentalEnzymeNames.has(site.enzyme.name)),
    [allRestrictionSites, parentalEnzymeNames],
  )
  const displayedRestrictionSites = useMemo(() => {
    if (!record) return []
    const filtered = filterRestrictionSitesForDisplay(restrictionSites, displaySettings.enzymes)
    const regenerated = regeneratedEndRestrictionSites(resolveDnaEnds(record), record.sequence.length)
    if (!regenerated.length || !displaySettings.enzymes.visible) return filtered
    return [...filtered, ...regenerated]
  }, [displaySettings.enzymes, record, restrictionSites])
  const displayablePrimerSites = useMemo(
    () => (record ? resolveDisplayablePrimerSites(record, displaySettings.primers.hybridization) : { bindings: [], displays: [] }),
    [displaySettings.primers.hybridization, record],
  )
  const primerBindings = displaySettings.primers.visible ? displayablePrimerSites.bindings : []
  const primerRows = useMemo(
    () =>
      (record?.primers ?? []).map((primer) => {
        const normalized = normalizeDna(primer.sequence)
        const thermo = calculateAnnealTemperature(normalized)
        return {
          primer,
          length: normalized.length,
          gc: gcContent(normalized),
          tm: thermo.tmC,
        }
      }),
    [record?.primers],
  )
  const enzymeTabCaretPosition = selectedRange && !cutStrandSelection ? selectedRange.start : 0
  const enzymeTabRows = useMemo(
    () =>
      sortEnzymeTabRows(
        groupRestrictionSitesByEnzyme(filterRestrictionSitesForEnzymeSet(restrictionSites, displaySettings.enzymes)),
        enzymeTabSortMode,
        enzymeTabCaretPosition,
        enzymeTabSortDirection,
      ),
    [displaySettings.enzymes, enzymeTabCaretPosition, enzymeTabSortDirection, enzymeTabSortMode, restrictionSites],
  )
  function toggleEnzymeTabSort(mode: EnzymeTabSortMode) {
    if (enzymeTabSortMode === mode) {
      setEnzymeTabSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setEnzymeTabSortMode(mode)
    setEnzymeTabSortDirection(mode === 'site-count' ? 'desc' : 'asc')
  }
  function updateDisplaySection<Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) {
    setCloningDisplaySettings((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }))
  }
  function handleRangeSelect(range: SelectionRange) {
    setLocalRange(range)
    setSelectedPrimerId(null)
    setLocalPrimerIds([])
    onRangeSelect?.(range)
  }
  /** Cloning dialogs are not for annotating — feature clicks select the DNA span. */
  function handleFeatureSelect(featureId: string) {
    if (!record) return
    const feature =
      displayAnnotationFeatures.find((entry) => entry.id === featureId) ??
      record.features.find((entry) => entry.id === featureId)
    if (!feature?.locations.length) return
    const bounds = featureBounds(feature)
    handleRangeSelect({ start: bounds.start, end: bounds.end })
  }
  function handleRestrictionSelect(site: RestrictionSite, extendSelection = false) {
    if (!allowEnzymeSelect) return
    onRestrictionSelect?.(site, extendSelection)
  }
  function handlePrimerSelect(primerId: string, extendSelection = false) {
    if (allowPrimerSelect && onPrimerSelect) {
      onPrimerSelect(primerId, extendSelection)
      return
    }
    if (controlledPrimerIds) return
    if (!extendSelection) {
      setSelectedPrimerId(primerId)
      setLocalPrimerIds([primerId])
      return
    }
    setLocalPrimerIds((current) => {
      if (current.includes(primerId)) {
        const next = current.filter((id) => id !== primerId)
        setSelectedPrimerId(next[0] ?? null)
        return next
      }
      const next = [...current, primerId].slice(-2)
      setSelectedPrimerId(next[0] ?? primerId)
      return next
    })
  }
  function navigateToEnzymeSite(site: RestrictionSite, extendSelection = false) {
    if (!record) return
    const range = restrictionSiteRange(site, record.sequence.length)
    setLocalRange(range)
    if (allowEnzymeSelect) onRestrictionSelect?.(site, extendSelection)
  }
  function pickEnzymeFromTable(
    sites: RestrictionSite[],
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) {
    const site = sites[0]
    if (!site) return
    const extendSelection = event.shiftKey || event.ctrlKey || event.metaKey
    navigateToEnzymeSite(site, extendSelection)
  }
  const enzymePickerSites = useMemo(
    () => filterRestrictionSitesForEnzymeSet(restrictionSites, displaySettings.enzymes),
    [displaySettings.enzymes, restrictionSites],
  )
  useEffect(() => {
    onEnzymePickerSitesChange?.(enzymePickerSites)
  }, [enzymePickerSites, onEnzymePickerSitesChange])
  if (!record) {
    return (
      <div className="cloning-preview-workspace cloning-preview-workspace-empty">
        <p>Select a construct source to preview.</p>
      </div>
    )
  }
  return (
    <div className={`cloning-record-workspace${selectionDetailsInStatus ? ' selection-details-in-status' : ''}`}>
      {(title || selectedSites.length > 0) && (
        <div className="cloning-record-workspace-status">
          <span>
            {title ? `${title} · ` : ''}
            {record.sequence.length.toLocaleString()} bp
            {selectedSites.length === 2
              ? ` · Selected: ${selectedSites[0]!.enzyme.name} (${Math.min(selectedSites[0]!.cutTop, selectedSites[0]!.cutBottom) + 1}) – ${selectedSites[1]!.enzyme.name} (${Math.min(selectedSites[1]!.cutTop, selectedSites[1]!.cutBottom) + 1})`
              : selectedSites.length === 1
                ? ` · Cut: ${selectedSites[0]!.enzyme.name}`
                : ''}
            {selectedRange && selectedRange.start !== selectedRange.end
              ? ` · ${selectionLength(selectedRange, record.sequence.length).toLocaleString()} bp`
              : ''}
          </span>
          {statusSelectionThermo && selectedRange && (
            <span className="cloning-record-workspace-selection-details" role="status" aria-live="polite">
              <strong>{selectionLength(selectedRange, record.sequence.length).toLocaleString()} bp selection</strong>
              <span>Tm {formatThermoTemperature(statusSelectionThermo)}</span>
              <span>GC {formatThermoGc(statusSelectionThermo)}</span>
              <small>{thermoMethodLabel(statusSelectionThermo.method)}</small>
            </span>
          )}
        </div>
      )}
      <div className="cloning-record-workspace-body">
        {!sequenceOnly && previewTab === 'Map' && (
          <div className="map-tab">
            <ViewSidebar
              settings={displaySettings}
              enzymePreferences={enzymePreferences}
              fileEnzymeSets={record.fileEnzymeSets ?? []}
              restrictionSites={restrictionSites}
              parentalRestrictionSites={parentalRestrictionSites}
              recordName={record.name}
              sequence={record.sequence}
              topology={record.topology}
              construct={record.construct}
              selectedRange={selectedRange}
              sequenceLength={record.sequence.length}
              showCircularVisualControls={!displaySettings.mapView.linear}
              hidePrimersToggle={!includePrimersTab}
              hideAlignmentsToggle
              onChange={setCloningDisplaySettings}
              onToggleMapZoom={toggleMapZoom}
              onEnzymeInfo={setEnzymeInfoName}
              onPreferencesChange={(preferences) => {
                setEnzymePreferences(preferences)
                saveEnzymePreferences(preferences)
              }}
              onPaintStrandColor={() => {}}
            />
            <div className="view-main">
              {displaySettings.mapView.zoom && mapZoomRange ? (
                <MapZoomStrip
                  sequenceLength={record.sequence.length}
                  annotationFeatures={mapAnnotationFeatures}
                  viewRange={mapZoomRange}
                  caretPosition={mapZoomCaretPosition(mapSelectedRange, record.sequence.length)}
                  sliderValue={mapZoomSlider}
                  onSliderValueChange={handleMapZoomSliderChange}
                  onViewRangeChange={handleMapZoomRangeChange}
                />
              ) : null}
              {displaySettings.mapView.linear ? (
                <div className={`linear-map-stage${displaySettings.mapView.zoom ? ' is-zoomed' : ''}`}>
                  <TrackMap
                    record={record}
                    restrictionSites={displayedRestrictionSites}
                    primerBindings={primerBindings}
                    annotationFeatures={mapAnnotationFeatures}
                    displaySettings={displaySettings}
                    enzymePreferences={enzymePreferences}
                    selectedRange={mapSelectedRange}
                    selectionCutStrandPair={cutStrandSelection}
                    selectedFeatureId={null}
                    selectedPrimerId={activePrimerId}
                    selectedPrimerIds={selectedPrimerIds}
                    selectedRestrictionSites={selectedSites}
                    traceFiles={noopTraces}
                    alignmentsVisible={false}
                    selectedAlignmentTraceId={null}
                    onSelectAlignmentTrace={() => {}}
                    onSelect={handleFeatureSelect}
                    onRangeSelect={handleRangeSelect}
                    onPrimerSelect={handlePrimerSelect}
                    onRestrictionSelect={handleRestrictionSelect}
                    onEnzymeInfo={setEnzymeInfoName}
                    onFeatureEdit={() => {}}
                    viewRange={displaySettings.mapView.zoom ? mapZoomRange : null}
                    onViewRangeChange={handleMapZoomRangeChange}
                  />
                </div>
              ) : (
                <CircularMapStage
                  record={record}
                  restrictionSites={displayedRestrictionSites}
                  primerBindings={primerBindings}
                  annotationFeatures={mapAnnotationFeatures}
                  displaySettings={displaySettings}
                  enzymePreferences={enzymePreferences}
                  selectedRange={mapSelectedRange}
                  selectionCutStrandPair={cutStrandSelection}
                  selectedFeatureId={null}
                  selectedPrimerId={activePrimerId}
                  selectedPrimerIds={selectedPrimerIds}
                  selectedRestrictionSites={selectedSites}
                  svgIdScope="cloning"
                  onSelect={handleFeatureSelect}
                  onRangeSelect={handleRangeSelect}
                  onPrimerSelect={handlePrimerSelect}
                  onRestrictionSelect={handleRestrictionSelect}
                  onEnzymeInfo={setEnzymeInfoName}
                  onFeatureEdit={() => {}}
                  onDisplaySettingsChange={setCloningDisplaySettings}
                  onSaveVisualSettings={() => {
                    savePersistedVisualSettings(displaySettings, defaultDisplaySettings, 'map')
                    setCloningDisplaySettings((current) => ({
                      ...current,
                      circularVisual: {
                        ...current.circularVisual,
                        panelOpen: false,
                        manualLabelPlacement: false,
                      },
                      proteinMapVisual: { ...current.proteinMapVisual, panelOpen: false },
                    }))
                  }}
                  onRevertVisualSettings={() => {
                    setCloningDisplaySettings((current) => ({
                      ...current,
                      circularVisual: { ...defaultDisplaySettings.circularVisual, panelOpen: true },
                      proteinMapVisual: { ...defaultDisplaySettings.proteinMapVisual },
                      labelRouting: { ...defaultDisplaySettings.labelRouting },
                    }))
                    clearPersistedVisualSettings('map')
                  }}
                />
              )}
            </div>
          </div>
        )}
        {previewTab === 'Sequence' && (
          <div className={`sequence-tab${sequenceOnly && !sequenceOnlySidebar ? ' is-sequence-only' : ''}`}>
            {sequenceOnly && sequenceOnlySidebar ? (
              <aside className="view-sidebar primer-anneal-preview-sidebar" aria-label="Annealing preview display controls">
                <EnzymeSidebarControl
                  settings={displaySettings}
                  enzymePreferences={enzymePreferences}
                  fileEnzymeSets={record.fileEnzymeSets ?? []}
                  restrictionSites={restrictionSites}
                  parentalRestrictionSites={parentalRestrictionSites}
                  recordName={record.name}
                  sequence={record.sequence}
                  topology={record.topology}
                  construct={record.construct}
                  selectedRange={selectedRange}
                  updateSection={updateDisplaySection}
                  onEnzymeInfo={setEnzymeInfoName}
                  onPreferencesChange={(preferences) => {
                    setEnzymePreferences(preferences)
                    saveEnzymePreferences(preferences)
                  }}
                />
                <button
                  type="button"
                  className={`sidebar-tool-button sidebar-feature-button ${displaySettings.features.visible ? 'is-active' : ''}`}
                  title={displaySettings.features.visible ? 'Hide features' : 'Show features'}
                  aria-pressed={displaySettings.features.visible}
                  onClick={() => updateDisplaySection('features', { visible: !displaySettings.features.visible })}
                >
                  <img src="/feature-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
                </button>
                <OrfSidebarControl settings={displaySettings} updateSection={updateDisplaySection} />
                <AminoAcidCodeSidebarControl settings={displaySettings} updateSection={updateDisplaySection} />
              </aside>
            ) : !sequenceOnly ? (
            <ViewSidebar
              settings={displaySettings}
              enzymePreferences={enzymePreferences}
              fileEnzymeSets={record.fileEnzymeSets ?? []}
              restrictionSites={restrictionSites}
              parentalRestrictionSites={parentalRestrictionSites}
              recordName={record.name}
              sequence={record.sequence}
              topology={record.topology}
              construct={record.construct}
              selectedRange={selectedRange}
              sequenceLength={record.sequence.length}
              sequencePane
              showSequenceVisualControls
              hidePrimersToggle={!includePrimersTab}
              hideAlignmentsToggle
              onChange={setCloningDisplaySettings}
              onToggleMapZoom={toggleMapZoom}
              onEnzymeInfo={setEnzymeInfoName}
              onPreferencesChange={(preferences) => {
                setEnzymePreferences(preferences)
                saveEnzymePreferences(preferences)
              }}
              onPaintStrandColor={() => {}}
            />
            ) : null}
            <SequenceWorkspace
              record={record}
              displayAnnotationFeatures={displayAnnotationFeatures}
              displayedRestrictionSites={displayedRestrictionSites}
              selectedRange={selectedRange}
              cutStrandSelection={cutStrandSelection}
              selectedFeatureId={null}
              selectedPrimerId={activePrimerId}
              selectedPrimerIds={selectedPrimerIds}
              selectedRestrictionSites={selectedSites}
              initialHoveredRestrictionSiteKey={null}
              scrollHostRef={sequenceScrollRef}
              onNavigate={(position) => handleRangeSelect({ start: position, end: position })}
              motifHits={[]}
              primerFrameDisplays={displaySettings.primers.visible ? (primerFrameDisplayOverrides ?? displayablePrimerSites.displays) : []}
              primerFramesAreThermodynamic={Boolean(primerFrameDisplayOverrides)}
              disablePrimer3PrimerFrameRefinement={disablePrimer3PrimerFrameRefinement}
              displaySettings={displaySettings}
              enzymePreferences={enzymePreferences}
              layoutActive
              traceAnnotationEnzymePool={activeEnzymePool}
              traceFiles={noopTraces}
              onTraceFilesChange={() => {}}
              selectedAlignmentTraceId={null}
              onSelectAlignmentTrace={() => {}}
              onTracesAdded={() => {}}
              viewRange={sequencePaneViewRange}
              onViewRangeChange={sequenceOnly ? undefined : handleMapZoomRangeChange}
              zoomSliderValue={mapZoomSlider}
              onZoomSliderValueChange={sequenceOnly ? undefined : handleMapZoomSliderChange}
              showInFrameTranslationExtensions={false}
              highlightMutagenicDnaBases={highlightMutagenicDnaBases}
              hideMinimap={hideSequenceMinimap}
              singleRowSequence={singleRowSequence}
              onFeatureSelect={handleFeatureSelect}
              onFeatureEdit={() => {}}
              onPrimerSelect={handlePrimerSelect}
              onRestrictionSelect={handleRestrictionSelect}
              onRangeSelect={(range) => handleRangeSelect(range)}
              onPrimerEdit={() => {}}
              onEnzymeInfo={setEnzymeInfoName}
              onApplyReferenceReplacement={() => {}}
              onDisplaySettingsChange={setCloningDisplaySettings}
              onSaveVisualSettings={() => {
                savePersistedVisualSettings(displaySettings, defaultDisplaySettings, 'sequence')
                setCloningDisplaySettings((current) => ({
                  ...current,
                  sequenceVisual: { ...current.sequenceVisual, panelOpen: false },
                }))
              }}
              onRevertVisualSettings={() => {
                setCloningDisplaySettings((current) => ({
                  ...current,
                  sequenceVisual: { ...defaultDisplaySettings.sequenceVisual, panelOpen: true },
                }))
                clearPersistedVisualSettings('sequence')
              }}
            />
          </div>
        )}
        {!sequenceOnly && previewTab === 'Enzymes' && (
          <div className="enzymes-tab">
            <EnzymeTabSetControl
              settings={displaySettings}
              enzymePreferences={enzymePreferences}
              fileEnzymeSets={record.fileEnzymeSets ?? []}
              restrictionSites={restrictionSites}
              parentalRestrictionSites={parentalRestrictionSites}
              recordName={record.name}
              sequence={record.sequence}
              topology={record.topology}
              construct={record.construct}
              selectedRange={selectedRange}
              enzymeCount={enzymeTabRows.length}
              updateSection={updateDisplaySection}
              onEnzymeInfo={setEnzymeInfoName}
              onPreferencesChange={(preferences) => {
                setEnzymePreferences(preferences)
                saveEnzymePreferences(preferences)
              }}
            />
            <div className="enzymes-tab-table-wrap">
              <table className="data-table enzymes-table">
                <thead>
                  <tr>
                    <th className="enzyme-sortable-header">
                      <EnzymeTableSortHeader
                        label="Enzyme"
                        mode="name"
                        activeMode={enzymeTabSortMode}
                        direction={enzymeTabSortDirection}
                        onSort={toggleEnzymeTabSort}
                      />
                    </th>
                    <th className="enzyme-sortable-header">
                      <EnzymeTableSortHeader
                        label="Sites"
                        mode="site-count"
                        activeMode={enzymeTabSortMode}
                        direction={enzymeTabSortDirection}
                        onSort={toggleEnzymeTabSort}
                      />
                    </th>
                    <th className="enzyme-positions-header">
                      <div className="enzyme-positions-header-inner">
                        <div className="enzyme-positions-sort-group">
                          <EnzymeTableSortHeader
                            label="Location"
                            mode="first-site"
                            activeMode={enzymeTabSortMode}
                            direction={enzymeTabSortDirection}
                            onSort={toggleEnzymeTabSort}
                          />
                          <EnzymeTableSortHeader
                            label="Caret"
                            mode="caret-distance"
                            activeMode={enzymeTabSortMode}
                            direction={enzymeTabSortDirection}
                            onSort={toggleEnzymeTabSort}
                          />
                        </div>
                        <div className="enzyme-position-mode-toggle" role="tablist" aria-label="Position display mode">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={enzymeTabPositionMode === 'numbers'}
                            className={enzymeTabPositionMode === 'numbers' ? 'is-active' : ''}
                            onClick={() => setEnzymeTabPositionMode('numbers')}
                          >
                            Numbers
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={enzymeTabPositionMode === 'lines'}
                            className={enzymeTabPositionMode === 'lines' ? 'is-active' : ''}
                            onClick={() => setEnzymeTabPositionMode('lines')}
                          >
                            Lines
                          </button>
                        </div>
                      </div>
                    </th>
                    <th>Type</th>
                    <th>Overhang</th>
                  </tr>
                </thead>
                <tbody>
                  {enzymeTabRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No restriction sites match the selected enzyme set.
                      </td>
                    </tr>
                  ) : (
                    enzymeTabRows.map(({ enzyme, sites }) => {
                      const methylationGreyed = sites.some(
                        (site) =>
                          site.methylationDisplay === 'blocked' ||
                          site.methylationDisplay === 'methyl-required-unavailable',
                      )
                      const methylationAsterisk = sites.some(
                        (site) =>
                          site.methylationDisplay === 'blocked' ||
                          site.methylationDisplay === 'methyl-required-available',
                      )
                      const isCutEnzyme = selectedSites.some((site) => site.enzyme.name === enzyme.name)
                      return (
                        <tr key={enzyme.name} className={isCutEnzyme ? 'is-cut-enzyme-row' : undefined}>
                          <td
                            className={[
                              'enzyme-name-cell',
                              'enzyme-name-cell-action',
                              isCutEnzyme ? 'is-selected' : '',
                              enzymePreferences.italicizeNames ? 'is-italic' : '',
                              enzymePreferences.boldUniqueCutters && sites.length === 1 ? 'is-unique-cutter' : '',
                              enzymePreferences.greenBluntCutters &&
                              enzyme.overhang.type === 'blunt' &&
                              !methylationGreyed
                                ? 'is-blunt-cutter'
                                : '',
                              methylationGreyed ? 'is-methylation-greyed' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={(event) => {
                              if (!allowEnzymeSelect) return
                              pickEnzymeFromTable(sites, event)
                            }}
                            onDoubleClick={() => setEnzymeInfoName(enzyme.name)}
                            title={
                              allowEnzymeSelect
                                ? 'Click to cut with this enzyme (Ctrl/Cmd-click to add). Double-click for enzyme information.'
                                : 'Double-click for enzyme information'
                            }
                          >
                            {methylationAsterisk ? `${enzyme.name}*` : enzyme.name}
                          </td>
                          <td className="enzyme-sites-cell">{sites.length}</td>
                          <td
                            className={`enzyme-positions-cell${enzymeTabPositionMode === 'numbers' ? ' is-numbers' : ' is-lines'}`}
                          >
                            {enzymeTabPositionMode === 'numbers' ? (
                              sites.map((site, index) => {
                                const range = restrictionSiteRange(site, record.sequence.length)
                                const isSelected =
                                  selectedRange !== null &&
                                  selectedRange.start === range.start &&
                                  selectedRange.end === range.end
                                return (
                                  <span key={siteKey(site)}>
                                    {index > 0 ? ', ' : ''}
                                    <button
                                      type="button"
                                      className={`enzyme-position-link${isSelected ? ' is-selected' : ''}`}
                                      onClick={(event) =>
                                        navigateToEnzymeSite(
                                          site,
                                          event.shiftKey || event.ctrlKey || event.metaKey,
                                        )
                                      }
                                    >
                                      {site.start + 1}
                                    </button>
                                  </span>
                                )
                              })
                            ) : (
                              <EnzymeSiteMinimap
                                sites={sites}
                                sequenceLength={record.sequence.length}
                                selectedRange={selectedRange}
                                onSiteSelect={(site, extendSelection) =>
                                  navigateToEnzymeSite(site, extendSelection)
                                }
                              />
                            )}
                          </td>
                          <td className="enzyme-meta-cell">{enzyme.type}</td>
                          <td className="enzyme-meta-cell">{overhangDescription(enzyme)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!sequenceOnly && previewTab === 'Primers' && includePrimersTab && (
          <div className="pcr-workspace-primers-tab">
            <table className="data-table pcr-workspace-primer-table">
              <thead>
                <tr>
                  <th>Primer</th>
                  <th>Length</th>
                  <th>Tm</th>
                  <th>GC</th>
                  <th>Sequence</th>
                </tr>
              </thead>
              <tbody>
                {primerRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No primers available in this preview.
                    </td>
                  </tr>
                ) : (
                  primerRows.map((row) => (
                    <tr
                      key={row.primer.id}
                      className={selectedPrimerIds.includes(row.primer.id) || selectedPrimerId === row.primer.id ? 'is-selected' : ''}
                      onClick={(event) =>
                        handlePrimerSelect(row.primer.id, event.shiftKey || event.ctrlKey || event.metaKey)
                      }
                    >
                      <td>{row.primer.name}</td>
                      <td>{row.length}</td>
                      <td>{row.tm !== null ? `${row.tm.toFixed(1)} C` : 'n/a'}</td>
                      <td>{row.gc.toFixed(1)}%</td>
                      <td className="pcr-workspace-primer-sequence">{normalizeDna(row.primer.sequence)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!sequenceOnly && (
      <footer className="cloning-record-workspace-footer">
        <div className="cloning-preview-view-tabs" role="tablist" aria-label="Construct preview">
          {(includePrimersTab
            ? (['Map', 'Sequence', 'Enzymes', 'Primers'] as const)
            : (['Map', 'Sequence', 'Enzymes'] as const)
          ).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={previewTab === name}
              className={previewTab === name ? 'is-active' : undefined}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </footer>
      )}
      {enzymeInfoName && (
        <EnzymeInfoDialog key={enzymeInfoName} initialEnzymeName={enzymeInfoName} onClose={() => setEnzymeInfoName(null)} />
      )}
    </div>
  )
}
