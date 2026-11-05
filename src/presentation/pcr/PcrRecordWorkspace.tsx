/* eslint-disable react-hooks/exhaustive-deps */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { clearPersistedVisualSettings, savePersistedVisualSettings } from '../../domain/displaySettingsPreferences'
import { findRestrictionSites } from '../../domain/enzymes'
import { enzymePoolForSettings, loadEnzymePreferences, saveEnzymePreferences, type EnzymePreferences } from '../../domain/enzymePreferences'
import { getCachedOrfFeatures } from '../../domain/orfPrediction'
import { regeneratedEndRestrictionSites } from '../../domain/newFileFromSelection'
import { resolveDnaEnds } from '../../domain/dnaEnds'
import { resolveDisplayablePrimerSites } from '../../domain/primerSequenceLayout'
import { displayableRecordFeatures } from '../../domain/primerPaneEntries'
import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'
import { featureBounds, gcContent, normalizeDna } from '../../domain/sequence'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { PcrWorkspaceRenderArgs } from '../../pcrWorkspaceTypes'
import {
  CircularMapStage,
  TrackMap,
} from '../map'
import { ViewSidebar } from '../dnaViewControls'
import {
  SequenceWorkspace,
  defaultDisplaySettings,
  filterRestrictionSitesForDisplay,
  isPrimerFeature,
  selectionLength,
  type DisplaySettings,
  type SelectionRange,
} from '../sequence'
import { initialDisplaySettings } from '../cloning/displaySettings'

export const PcrRecordWorkspace = memo(function PcrRecordWorkspace({
  record,
  title,
  primerHybridization,
  selectedRange: controlledRange,
  selectedPrimerIds,
  onRangeSelect,
  onPrimerSelect,
}: PcrWorkspaceRenderArgs) {
  const [tab, setTab] = useState<'Map' | 'Sequence' | 'Primers'>('Map')
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => ({
    ...initialDisplaySettings(record?.topology ?? 'circular'),
    primers: { ...defaultDisplaySettings.primers, visible: true, hybridization: primerHybridization ?? defaultDisplaySettings.primers.hybridization },
    enzymes: { ...defaultDisplaySettings.enzymes, set: 'unique-six-plus' },
    alignments: { visible: false },
  }))
  const [enzymePreferences, setEnzymePreferences] = useState<EnzymePreferences>(() => loadEnzymePreferences())
  const [localRange, setLocalRange] = useState<SelectionRange | null>(null)
  const sequenceScrollRef = useRef<HTMLDivElement | null>(null)
  const noopTraces = useRef<TraceFileRecord[]>([]).current

  useEffect(() => {
    if (!record) return
    setDisplaySettings((current) => ({
      ...initialDisplaySettings(record.topology),
      primers: { ...defaultDisplaySettings.primers, visible: true, hybridization: primerHybridization ?? defaultDisplaySettings.primers.hybridization },
      enzymes: { ...defaultDisplaySettings.enzymes, set: 'unique-six-plus' },
      alignments: { visible: false },
      circularVisual: current.circularVisual,
      proteinMapVisual: current.proteinMapVisual,
      proteinSequenceVisual: current.proteinSequenceVisual,
      proteinAlignmentVisual: current.proteinAlignmentVisual,
      sequenceVisual: current.sequenceVisual,
      labelRouting: current.labelRouting,
    }))
    setLocalRange(null)
  }, [record?.id, record?.topology])

  useEffect(() => {
    if (!primerHybridization) return
    setDisplaySettings((current) => ({
      ...current,
      primers: { ...current.primers, hybridization: primerHybridization },
    }))
  }, [primerHybridization?.minContinuousMatchLen, primerHybridization?.allowMismatch, primerHybridization?.minMeltingTemperature])

  const selectedRange = controlledRange ?? localRange
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

  const displayAnnotationFeatures = useMemo(() => {
    if (!record) return []
    const visibleRecordFeatures = displayableRecordFeatures(record.features, {
      featuresVisible: displaySettings.features.visible,
      sgRnasVisible: displaySettings.primers.sgRnasVisible,
      includeRulerTrack: true,
    })
    return displaySettings.orfs.visible ? [...visibleRecordFeatures, ...cachedOrfFeatures] : visibleRecordFeatures
  }, [cachedOrfFeatures, displaySettings.features.visible, displaySettings.orfs.visible, displaySettings.primers.sgRnasVisible, record])
  const mapAnnotationFeatures = useMemo(
    () => displayAnnotationFeatures.filter((feature) => !isPrimerFeature(feature)),
    [displayAnnotationFeatures],
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

  function handleRangeSelect(range: SelectionRange) {
    setLocalRange(range)
    onRangeSelect?.(range)
  }

  /** PCR/cloning previews are not for annotating — feature clicks select the DNA span. */
  function handleFeatureSelect(featureId: string) {
    if (!record) return
    const feature =
      displayAnnotationFeatures.find((entry) => entry.id === featureId) ??
      record.features.find((entry) => entry.id === featureId)
    if (!feature?.locations.length) return
    const bounds = featureBounds(feature)
    handleRangeSelect({ start: bounds.start, end: bounds.end })
  }

  if (!record) {
    return (
      <div className="cloning-preview-workspace cloning-preview-workspace-empty">
        <p>Select a construct source to preview.</p>
      </div>
    )
  }

  return (
    <div className="cloning-record-workspace">
      <div className="cloning-record-workspace-status">
        {title ? `${title} · ` : ''}
        {record.sequence.length.toLocaleString()} bp
        {selectedRange && selectedRange.start !== selectedRange.end
          ? ` · ${selectionLength(selectedRange, record.sequence.length).toLocaleString()} bp`
          : ''}
      </div>
      <div className="cloning-record-workspace-body">
        {tab === 'Map' && (
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
              hideAlignmentsToggle
              onChange={setDisplaySettings}
              onEnzymeInfo={() => {}}
              onPreferencesChange={(preferences) => {
                setEnzymePreferences(preferences)
                saveEnzymePreferences(preferences)
              }}
              onPaintStrandColor={() => {}}
            />
            <div className="view-main">
              {displaySettings.mapView.linear ? (
                <div className="linear-map-stage">
                  <TrackMap
                    record={record}
                    restrictionSites={displayedRestrictionSites}
                    primerBindings={primerBindings}
                    annotationFeatures={mapAnnotationFeatures}
                    displaySettings={displaySettings}
                    enzymePreferences={enzymePreferences}
                    selectedRange={selectedRange}
                    selectedFeatureId={null}
                    selectedPrimerId={selectedPrimerIds[0] ?? null}
                    selectedPrimerIds={selectedPrimerIds}
                    traceFiles={noopTraces}
                    alignmentsVisible={false}
                    selectedAlignmentTraceId={null}
                    onSelectAlignmentTrace={() => {}}
                    onSelect={handleFeatureSelect}
                    onRangeSelect={handleRangeSelect}
                    onPrimerSelect={(id) => onPrimerSelect?.(id)}
                    onRestrictionSelect={() => {}}
                    onEnzymeInfo={() => {}}
                    onFeatureEdit={() => {}}
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
                  selectedRange={selectedRange}
                  selectedFeatureId={null}
                  selectedPrimerId={selectedPrimerIds[0] ?? null}
                  selectedPrimerIds={selectedPrimerIds}
                  svgIdScope="pcr"
                  onSelect={handleFeatureSelect}
                  onRangeSelect={handleRangeSelect}
                  onPrimerSelect={(id) => onPrimerSelect?.(id)}
                  onRestrictionSelect={() => {}}
                  onEnzymeInfo={() => {}}
                  onFeatureEdit={() => {}}
                  onDisplaySettingsChange={setDisplaySettings}
                  onSaveVisualSettings={() => {
                    savePersistedVisualSettings(displaySettings, defaultDisplaySettings, 'map')
                    setDisplaySettings((current) => ({
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
                    setDisplaySettings((current) => ({
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

        {tab === 'Sequence' && (
          <div className="sequence-tab">
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
              hideAlignmentsToggle
              onChange={setDisplaySettings}
              onEnzymeInfo={() => {}}
              onPreferencesChange={(preferences) => {
                setEnzymePreferences(preferences)
                saveEnzymePreferences(preferences)
              }}
              onPaintStrandColor={() => {}}
            />
            <SequenceWorkspace
              record={record}
              displayAnnotationFeatures={displayAnnotationFeatures}
              displayedRestrictionSites={displayedRestrictionSites}
              selectedRange={selectedRange}
              cutStrandSelection={null}
              selectedFeatureId={null}
              selectedPrimerId={selectedPrimerIds[0] ?? null}
              selectedPrimerIds={selectedPrimerIds}
              initialHoveredRestrictionSiteKey={null}
              scrollHostRef={sequenceScrollRef}
              onNavigate={(position) => handleRangeSelect({ start: position, end: position })}
              motifHits={[]}
              primerFrameDisplays={displaySettings.primers.visible ? displayablePrimerSites.displays : []}
              displaySettings={displaySettings}
              enzymePreferences={enzymePreferences}
              layoutActive
              traceAnnotationEnzymePool={activeEnzymePool}
              traceFiles={noopTraces}
              onTraceFilesChange={() => {}}
              selectedAlignmentTraceId={null}
              onSelectAlignmentTrace={() => {}}
              onTracesAdded={() => {}}
              onFeatureSelect={handleFeatureSelect}
              onFeatureEdit={() => {}}
              onPrimerSelect={(id) => onPrimerSelect?.(id)}
              onRestrictionSelect={() => {}}
              onRangeSelect={(range) => handleRangeSelect(range)}
              onPrimerEdit={() => {}}
              onEnzymeInfo={() => {}}
              onApplyReferenceReplacement={() => {}}
              onDisplaySettingsChange={setDisplaySettings}
              onSaveVisualSettings={() => {
                savePersistedVisualSettings(displaySettings, defaultDisplaySettings, 'sequence')
                setDisplaySettings((current) => ({
                  ...current,
                  sequenceVisual: { ...current.sequenceVisual, panelOpen: false },
                }))
              }}
              onRevertVisualSettings={() => {
                setDisplaySettings((current) => ({
                  ...current,
                  sequenceVisual: { ...defaultDisplaySettings.sequenceVisual, panelOpen: true },
                }))
                clearPersistedVisualSettings('sequence')
              }}
            />
          </div>
        )}

        {tab === 'Primers' && (
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
                      className={selectedPrimerIds.includes(row.primer.id) ? 'is-selected' : ''}
                      onClick={() => onPrimerSelect?.(row.primer.id)}
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
      <div className="cloning-record-workspace-tabs">
        {(['Map', 'Sequence', 'Primers'] as const).map((tabName) => (
          <button
            key={tabName}
            type="button"
            className={tab === tabName ? 'is-active' : undefined}
            onClick={() => setTab(tabName)}
          >
            {tabName}
          </button>
        ))}
      </div>
    </div>
  )
})
