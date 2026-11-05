import { useDeferredValue, useMemo } from 'react'
import {
  buildLibraryMapBrowseKeys,
  clampMapViewSelectedRange,
  libraryMapBrowseIndex as resolveLibraryMapBrowseIndex,
  libraryMapConsensusVisible as resolveLibraryMapConsensusVisible,
  resolveLibraryMapBrowseMember,
  resolveLibraryMapBrowseMemberId,
  resolveMainDisplayablePrimerSites,
  resolveMapViewAnnotationFeatures,
  resolveMapViewPrimerBindings,
  resolveMapViewRecord,
  resolveMapViewRestrictionSites,
  selectLibraryMapMembers,
} from '../../application/workspaceInteraction/libraryMapView'
import { primerWarnings } from '../../domain/cloning'
import { enzymePoolForSettings, type EnzymePreferences } from '../../domain/enzymePreferences'
import { resolveDnaEnds } from '../../domain/dnaEnds'
import { actionProfileSync } from '../../domain/actionProfiler'
import { formatSequenceLength, type MoleculeCapabilities } from '../../domain/moleculeCapabilities'
import { regeneratedEndRestrictionSites } from '../../domain/newFileFromSelection'
import { getCachedOrfFeatures, getCachedOrfTranslations, type OrfPredictionSettings } from '../../domain/orfPrediction'
import type { RestrictionSite } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { enzymeSiteCounts } from '../map/mapPrimitives'
import type { PrimerPaneSortDirection, SgRnaPaneSortMode } from '../../domain/primerPaneEntries'
import type { PrimerTabSortMode } from '../../domain/primerExport'
import {
  type DisplaySettings,
  type EnzymeTabSortDirection,
  type EnzymeTabSortMode,
  type FeatureTabSortDirection,
  type FeatureTabSortMode,
  type SelectionRange,
  type StrandPairSelection,
  type WorkspaceTab,
} from '../sequence'
import {
  filterRestrictionSitesForDisplay,
  filterRestrictionSitesForEnzymeSet,
} from '../sequence/sequenceRenderingHelpers'
import { groupRestrictionSitesByEnzyme, sortEnzymeTabRows } from '../workspaceTabs/enzymeTabModel'
import { useRestrictionSiteScan } from '../hooks/useRestrictionSiteScan'
import {
  buildDisplayAnnotationFeatures,
  buildFeatureTabProjection,
  buildFeatureVisibilityTargetIds,
  buildMapAnnotationFeatures,
  buildSelectableAnnotations,
  buildSelectedFeaturesForMenu,
  canOpenSelectedFeatureAsProtein as resolveCanOpenSelectedFeatureAsProtein,
  resolveFeaturePaneSourceFeatures,
  resolveFeatureSelectionMember,
  resolveSelectedAnnotation,
  resolveSelectedFeature,
  resolveSelectedLibraryMember,
} from '../workspaceTabs/featurePaneProjection'
import {
  buildPrimerTabProjection,
  buildSelectedSgRnasForCloning,
  buildSelectedSgRnasForExport,
  resolveSelectedPrimerPaneSgRna,
} from '../workspaceTabs/primerTabProjection'
import type { SequenceRecord } from '../../domain/types'

export type WorkspaceViewProjectionInput = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  displaySettings: DisplaySettings
  enzymePreferences: EnzymePreferences
  moleculeCapabilities: MoleculeCapabilities
  alignmentsVisible: boolean
  activeTab: WorkspaceTab
  selectionFocus: 'dna' | 'feature' | 'primer' | 'bond'
  selectedRange: SelectionRange | null
  cutStrandSelection: StrandPairSelection | null
  cutSelectionAnchor: RestrictionSite | null
  cutSelectionEnzymes: { upstream: RestrictionSite; downstream: RestrictionSite } | null
  selectedFeatureId: string | null
  selectedFeatureIds: string[]
  selectedAlignmentTraceId: string | null
  featureTabSelectionMemberId: string | null
  selectedProteinBondId: string | null
  enzymeTabSortMode: EnzymeTabSortMode
  enzymeTabSortDirection: EnzymeTabSortDirection
  featureTabSortMode: FeatureTabSortMode
  featureTabSortDirection: FeatureTabSortDirection
  primerTabSortMode: PrimerTabSortMode
  primerTabSortDirection: PrimerPaneSortDirection
  oligoTabSortMode: PrimerTabSortMode
  oligoTabSortDirection: PrimerPaneSortDirection
  sgRnaTabSortMode: SgRnaPaneSortMode
  sgRnaTabSortDirection: PrimerPaneSortDirection
}

/** Read-only workspace view projections for tabs, map browse, ORFs, enzymes, and primers. */
export function useWorkspaceViewProjection(input: WorkspaceViewProjectionInput) {
  const {
    record,
    traceFiles,
    displaySettings,
    enzymePreferences,
    moleculeCapabilities,
    alignmentsVisible,
    activeTab,
    selectionFocus,
    selectedRange,
    cutStrandSelection,
    cutSelectionAnchor,
    cutSelectionEnzymes,
    selectedFeatureId,
    selectedFeatureIds,
    selectedAlignmentTraceId,
    featureTabSelectionMemberId,
    selectedProteinBondId,
    enzymeTabSortMode,
    enzymeTabSortDirection,
    featureTabSortMode,
    featureTabSortDirection,
    primerTabSortMode,
    primerTabSortDirection,
    oligoTabSortMode,
    oligoTabSortDirection,
    sgRnaTabSortMode,
    sgRnaTabSortDirection,
  } = input

  const orfSettings = useMemo<OrfPredictionSettings>(
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

  const cachedOrfFeatures = useMemo(
    () =>
      moleculeCapabilities.orfPrediction
        ? actionProfileSync(
            'orfFeatures',
            'orfs',
            () => getCachedOrfFeatures(record.sequence, orfSettings),
            formatSequenceLength(record.sequence.length, record.molecule),
          )
        : [],
    [moleculeCapabilities.orfPrediction, orfSettings, record.molecule, record.sequence],
  )

  const cachedOrfTranslations = useMemo(
    () =>
      moleculeCapabilities.orfPrediction
        ? actionProfileSync(
            'orfTranslations',
            'orfs',
            () => getCachedOrfTranslations(record.sequence, orfSettings),
            formatSequenceLength(record.sequence.length, record.molecule),
          )
        : new Map(),
    [moleculeCapabilities.orfPrediction, orfSettings, record.molecule, record.sequence],
  )

  const visibleOrfFeatures = useMemo(
    () => (displaySettings.orfs.visible ? cachedOrfFeatures : []),
    [cachedOrfFeatures, displaySettings.orfs.visible],
  )

  const visibleOrfTranslations = displaySettings.orfs.visible ? cachedOrfTranslations : undefined

  const displayAnnotationFeatures = useMemo(
    () => buildDisplayAnnotationFeatures(
      record.features,
      {
        featuresVisible: displaySettings.features.visible,
        orfsVisible: displaySettings.orfs.visible,
        sgRnasVisible: displaySettings.primers.sgRnasVisible,
      },
      visibleOrfFeatures,
    ),
    [displaySettings.features.visible, displaySettings.orfs.visible, displaySettings.primers.sgRnasVisible, visibleOrfFeatures, record.features],
  )

  const mapAnnotationFeatures = useMemo(
    () => buildMapAnnotationFeatures(displayAnnotationFeatures, record.features, displaySettings.features.visible),
    [displayAnnotationFeatures, displaySettings.features.visible, record.features],
  )

  const selectableAnnotations = useMemo(
    () => buildSelectableAnnotations(record, traceFiles, alignmentsVisible, visibleOrfFeatures),
    [alignmentsVisible, visibleOrfFeatures, record, traceFiles],
  )

  const selectedLibraryMember = resolveSelectedLibraryMember(record, traceFiles, selectedAlignmentTraceId)

  const featureSelectionMember = resolveFeatureSelectionMember(
    record,
    traceFiles,
    activeTab,
    selectionFocus,
    featureTabSelectionMemberId,
    selectedLibraryMember,
  )

  const selectedFeature = resolveSelectedFeature(record, traceFiles, selectedFeatureId, featureSelectionMember)
  const selectedAnnotation = resolveSelectedAnnotation(selectableAnnotations, selectedFeatureId)
  const canOpenAsProtein = resolveCanOpenSelectedFeatureAsProtein(record, selectedAnnotation)
  const selectedProteinBond = selectedProteinBondId
    ? (record.protein?.bonds.find((bond) => bond.id === selectedProteinBondId) ?? null)
    : null

  const activeEnzymePool = useMemo(
    () => enzymePoolForSettings(displaySettings.enzymes, enzymePreferences),
    [displaySettings.enzymes, enzymePreferences],
  )

  const parentalEnzymePool = useMemo(() => {
    const parentalSet = enzymePreferences.parentalSet === 'all' ? 'all' : 'nonredundant'
    return enzymePoolForSettings({ set: parentalSet, selectedNames: [], supplierSetId: null }, enzymePreferences)
  }, [enzymePreferences])

  const enzymeScanSequence = useDeferredValue(record.sequence)
  const enzymeScanConstruct = useDeferredValue(record.construct)

  const unionEnzymePool = useMemo(() => {
    const byName = new Map(activeEnzymePool.map((enzyme) => [enzyme.name, enzyme]))
    parentalEnzymePool.forEach((enzyme) => byName.set(enzyme.name, enzyme))
    return [...byName.values()]
  }, [activeEnzymePool, parentalEnzymePool])

  const previewEnzymePool = useMemo(
    () =>
      displaySettings.enzymes.set === 'unique-six-plus' || displaySettings.enzymes.set === 'six-plus'
        ? activeEnzymePool.filter((enzyme) => enzyme.recognition.length >= 6)
        : activeEnzymePool,
    [activeEnzymePool, displaySettings.enzymes.set],
  )

  const enzymeScan = useRestrictionSiteScan({
    enabled:
      moleculeCapabilities.restrictionEnzymes &&
      (displaySettings.enzymes.visible || activeTab === 'Enzymes'),
    sequence: enzymeScanSequence,
    topology: record.topology,
    construct: enzymeScanConstruct,
    enzymeNames: unionEnzymePool.map((enzyme) => enzyme.name),
    previewEnzymeNames: previewEnzymePool.map((enzyme) => enzyme.name),
    previewSiteCap:
      displaySettings.enzymes.set === 'unique' || displaySettings.enzymes.set === 'unique-six-plus'
        ? 2
        : displaySettings.enzymes.set === 'unique-dual'
          ? 3
          : undefined,
  })

  const activeEnzymeNames = useMemo(
    () => new Set(activeEnzymePool.map((enzyme) => enzyme.name)),
    [activeEnzymePool],
  )

  const parentalEnzymeNames = useMemo(
    () => new Set(parentalEnzymePool.map((enzyme) => enzyme.name)),
    [parentalEnzymePool],
  )

  const restrictionSites = useMemo(
    () => enzymeScan.sites.filter((site) => activeEnzymeNames.has(site.enzyme.name)),
    [activeEnzymeNames, enzymeScan.sites],
  )

  const parentalRestrictionSites = useMemo(
    () =>
      enzymeScan.stage === 'complete'
        ? enzymeScan.sites.filter((site) => parentalEnzymeNames.has(site.enzyme.name))
        : [],
    [enzymeScan.sites, enzymeScan.stage, parentalEnzymeNames],
  )

  const dnaEnds = record.dnaEnds
  const sequenceLength = record.sequence.length

  const displayedRestrictionSites = useMemo(() => {
    if (!moleculeCapabilities.restrictionEnzymes) return []
    const filtered = filterRestrictionSitesForDisplay(restrictionSites, displaySettings.enzymes)
    const hiddenNames = new Set(displaySettings.enzymes.hiddenNames ?? [])
    const regenerated = regeneratedEndRestrictionSites(resolveDnaEnds({ dnaEnds }), sequenceLength)
      .filter((site) => !hiddenNames.has(site.enzyme.name))
    if (!regenerated.length || !displaySettings.enzymes.visible) return filtered
    return [...filtered, ...regenerated]
  }, [displaySettings.enzymes, dnaEnds, moleculeCapabilities.restrictionEnzymes, restrictionSites, sequenceLength])

  const enzymeTabCaretPosition = selectedRange && !cutStrandSelection ? selectedRange.start : 0

  const canCreateFileFromSelection = Boolean(
    (cutStrandSelection && cutSelectionEnzymes) ||
      (selectedRange && !cutStrandSelection && selectedRange.end > selectedRange.start),
  )

  const selectedRestrictionSites = useMemo(() => {
    if (cutSelectionEnzymes) {
      return [cutSelectionEnzymes.upstream, cutSelectionEnzymes.downstream]
    }
    if (cutSelectionAnchor) return [cutSelectionAnchor]
    return []
  }, [cutSelectionAnchor, cutSelectionEnzymes])

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

  const featureTabProjection = useMemo(
    () => buildFeatureTabProjection(record, traceFiles, featureTabSortMode, featureTabSortDirection),
    [featureTabSortDirection, featureTabSortMode, record, traceFiles],
  )

  const primerTabProjection = useMemo(
    () => buildPrimerTabProjection({
      record,
      traceFiles,
      hybridization: displaySettings.primers.hybridization,
      sorts: {
        primerSort: { mode: primerTabSortMode, direction: primerTabSortDirection },
        oligoSort: { mode: oligoTabSortMode, direction: oligoTabSortDirection },
        sgRnaSort: { mode: sgRnaTabSortMode, direction: sgRnaTabSortDirection },
      },
      warningsFor: (primer) => primerWarnings(primer).join('; ') || 'passes basic checks',
    }),
    [
      displaySettings.primers.hybridization,
      oligoTabSortDirection,
      oligoTabSortMode,
      primerTabSortDirection,
      primerTabSortMode,
      record,
      sgRnaTabSortDirection,
      sgRnaTabSortMode,
      traceFiles,
    ],
  )

  const selectedPrimerPaneSgRna = resolveSelectedPrimerPaneSgRna(
    primerTabProjection.entries,
    selectionFocus,
    featureTabSelectionMemberId,
    selectedFeatureId,
  )

  const visibilityTargetIds = useMemo(() => {
    const libraryMember = resolveSelectedLibraryMember(record, traceFiles, selectedAlignmentTraceId)
    const sourceFeatures = resolveFeaturePaneSourceFeatures(record, traceFiles, featureTabSelectionMemberId, libraryMember)
    const selectionMember = resolveFeatureSelectionMember(
      record,
      traceFiles,
      activeTab,
      selectionFocus,
      featureTabSelectionMemberId,
      libraryMember,
    )
    const resolvedSelectedFeature = resolveSelectedFeature(record, traceFiles, selectedFeatureId, selectionMember)
    return buildFeatureVisibilityTargetIds({
      activeTab,
      selectedFeature: resolvedSelectedFeature,
      selectedFeatureIds,
      selectionFocus,
      sourceFeatures,
    })
  }, [
    activeTab,
    featureTabSelectionMemberId,
    record,
    selectedAlignmentTraceId,
    selectedFeatureId,
    selectedFeatureIds,
    selectionFocus,
    traceFiles,
  ])

  const menuSelection = useMemo(() => {
    const libraryMember = resolveSelectedLibraryMember(record, traceFiles, selectedAlignmentTraceId)
    const sourceFeatures = resolveFeaturePaneSourceFeatures(record, traceFiles, featureTabSelectionMemberId, libraryMember)
    const selectionMember = resolveFeatureSelectionMember(
      record,
      traceFiles,
      activeTab,
      selectionFocus,
      featureTabSelectionMemberId,
      libraryMember,
    )
    const resolvedSelectedFeature = resolveSelectedFeature(record, traceFiles, selectedFeatureId, selectionMember)
    return buildSelectedFeaturesForMenu(sourceFeatures, visibilityTargetIds, resolvedSelectedFeature)
  }, [
    activeTab,
    featureTabSelectionMemberId,
    visibilityTargetIds,
    record,
    selectedAlignmentTraceId,
    selectedFeatureId,
    selectionFocus,
    traceFiles,
  ])

  const selectedSgRnasForExport = useMemo(
    () => buildSelectedSgRnasForExport(
      record,
      traceFiles,
      featureTabSelectionMemberId,
      resolveSelectedLibraryMember(record, traceFiles, selectedAlignmentTraceId),
      visibilityTargetIds,
    ),
    [featureTabSelectionMemberId, visibilityTargetIds, record, selectedAlignmentTraceId, traceFiles],
  )

  const selectedSgRnasForCloning = useMemo(
    () => buildSelectedSgRnasForCloning(selectedSgRnasForExport),
    [selectedSgRnasForExport],
  )

  const displayablePrimerSites = useMemo(
    () => resolveMainDisplayablePrimerSites(record, displaySettings.primers.hybridization),
    [displaySettings.primers.hybridization, record],
  )

  const libraryMapMembers = useMemo(
    () => selectLibraryMapMembers({ alignmentsVisible, record, traceFiles }),
    [alignmentsVisible, record, traceFiles],
  )

  const libraryMapConsensusVisible = resolveLibraryMapConsensusVisible(record)
  const libraryMapBrowseActive = libraryMapMembers.length > 0

  const libraryMapBrowseMemberId = useMemo(
    () => resolveLibraryMapBrowseMemberId({
      browseActive: libraryMapBrowseActive,
      consensusVisible: libraryMapConsensusVisible,
      members: libraryMapMembers,
      selectedAlignmentTraceId,
    }),
    [libraryMapBrowseActive, libraryMapConsensusVisible, libraryMapMembers, selectedAlignmentTraceId],
  )

  const libraryMapBrowseMember = resolveLibraryMapBrowseMember(
    libraryMapBrowseMemberId,
    libraryMapMembers,
  )

  const libraryMapBrowseKeys = useMemo(
    () => buildLibraryMapBrowseKeys(libraryMapConsensusVisible, libraryMapMembers),
    [libraryMapConsensusVisible, libraryMapMembers],
  )

  const libraryMapBrowseIndex = resolveLibraryMapBrowseIndex(
    libraryMapBrowseKeys,
    libraryMapBrowseMemberId,
  )

  const viewRecord = useMemo(
    () => resolveMapViewRecord(record, libraryMapBrowseMember),
    [libraryMapBrowseMember, record],
  )

  const mapRestrictionSites = useMemo(
    () => resolveMapViewRestrictionSites({
      activeEnzymePool,
      browseMember: libraryMapBrowseMember,
      construct: record.construct,
      displayedRestrictionSites,
      enzymeDisplay: displaySettings.enzymes,
      mapViewRecord: viewRecord,
      restrictionEnzymesEnabled: moleculeCapabilities.restrictionEnzymes,
    }),
    [activeEnzymePool, displaySettings.enzymes, displayedRestrictionSites, libraryMapBrowseMember, viewRecord, moleculeCapabilities.restrictionEnzymes, record.construct],
  )

  const mapAnnotationFeaturesForView = useMemo(() => {
    const memberOrfFeatures = libraryMapBrowseMember && displaySettings.orfs.visible && moleculeCapabilities.orfPrediction
      ? getCachedOrfFeatures(libraryMapBrowseMember.sequence, orfSettings)
      : []
    return resolveMapViewAnnotationFeatures({
      browseMember: libraryMapBrowseMember,
      featureDisplay: {
        featuresVisible: displaySettings.features.visible,
        orfsVisible: displaySettings.orfs.visible,
        sgRnasVisible: displaySettings.primers.sgRnasVisible,
      },
      mapAnnotationFeatures,
      memberOrfFeatures,
      orfPredictionEnabled: moleculeCapabilities.orfPrediction,
    })
  }, [displaySettings.features.visible, displaySettings.orfs.visible, displaySettings.primers.sgRnasVisible, libraryMapBrowseMember, mapAnnotationFeatures, moleculeCapabilities.orfPrediction, orfSettings])

  const mapPrimerBindings = resolveMapViewPrimerBindings({
    browseMember: libraryMapBrowseMember,
    mapViewRecord: viewRecord,
    primerBindings: displayablePrimerSites.bindings,
    primerDisplay: { visible: displaySettings.primers.visible, hybridization: displaySettings.primers.hybridization },
  })

  const mapSelectedRange = useMemo(
    () => clampMapViewSelectedRange({
      selectedRange,
      cutStrandForward: cutStrandSelection?.forward,
      mapViewSequenceLength: viewRecord.sequence.length,
    }),
    [cutStrandSelection?.forward, viewRecord.sequence.length, selectedRange],
  )

  const mapSequenceLength = viewRecord.sequence.length

  const menuNoncutters = useMemo(() => {
    const counts = enzymeSiteCounts(restrictionSites)
    return activeEnzymePool
      .map((enzyme) => enzyme.name)
      .filter((name) => !(counts[name] ?? 0))
      .toSorted((left, right) => left.localeCompare(right))
  }, [activeEnzymePool, restrictionSites])

  const parentalSiteCounts = useMemo(
    () => enzymeSiteCounts(parentalRestrictionSites),
    [parentalRestrictionSites],
  )

  return {
    orf: {
      settings: orfSettings,
      cachedFeatures: cachedOrfFeatures,
      visibleFeatures: visibleOrfFeatures,
      visibleTranslations: visibleOrfTranslations,
    },
    selection: {
      canCreateFileFromSelection,
    },
    annotations: {
      display: displayAnnotationFeatures,
      map: mapAnnotationFeatures,
      selectable: selectableAnnotations,
      selected: selectedAnnotation,
    },
    features: {
      libraryMember: selectedLibraryMember,
      selectionMember: featureSelectionMember,
      selected: selectedFeature,
      canOpenAsProtein,
      selectedProteinBond,
      tabEntries: featureTabProjection.entries,
      tabRows: featureTabProjection.featureRows,
      visibilityTargetIds,
      menuSelection,
    },
    primers: {
      tabEntries: primerTabProjection.entries,
      tabPrimerRows: primerTabProjection.primerRows,
      tabSgRnaRows: primerTabProjection.sgRnaRows,
      selectedPaneSgRna: selectedPrimerPaneSgRna,
      displaySites: displayablePrimerSites,
      bindings: displayablePrimerSites.bindings,
      selectedSgRnasForExport,
      selectedSgRnasForCloning,
    },
    enzymes: {
      activePool: activeEnzymePool,
      scan: enzymeScan,
      restrictionSites,
      parentalRestrictionSites,
      displayedRestrictionSites,
      tabCaretPosition: enzymeTabCaretPosition,
      selectedRestrictionSites,
      tabRows: enzymeTabRows,
      menuNoncutters,
      parentalSiteCounts,
    },
    map: {
      members: libraryMapMembers,
      browseActive: libraryMapBrowseActive,
      browseMemberId: libraryMapBrowseMemberId,
      browseMember: libraryMapBrowseMember,
      browseKeys: libraryMapBrowseKeys,
      browseIndex: libraryMapBrowseIndex,
      consensusVisible: libraryMapConsensusVisible,
      viewRecord,
      restrictionSites: mapRestrictionSites,
      annotationFeatures: mapAnnotationFeaturesForView,
      primerBindings: mapPrimerBindings,
      selectedRange: mapSelectedRange,
      sequenceLength: mapSequenceLength,
    },
  }
}

export type WorkspaceViewProjection = ReturnType<typeof useWorkspaceViewProjection>
