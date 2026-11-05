import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { enzymeLabelDisplayStyle, type EnzymePreferences } from '../../domain/enzymePreferences'
import { useEnzymeHoverTooltip } from './useEnzymeHoverTooltip'
import { groupSgRNAFeatures } from '../../domain/sgrna'
import {
  isSgRnaCalloutSite,
  sgRnaCircularBindingRadius,
  sgRnaCircularLeaderAnchor,
  sgRnaMapCalloutLabelFont,
  sgRnaMapDisplaySegments,
  sgRnaMapPamArrowSpan,
  sgRnaVisualSegments,
  SG_RNA_MAP_LABEL_FONT_SIZE_PX,
  SG_RNA_MAP_LABEL_FONT_WEIGHT,
  SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX,
} from '../../domain/sgrnaVisualLayout'
import { isOrfFeature } from '../../domain/orfPrediction'
import { needsFinalRadiusSearch, planInvalidRadiusRecovery, selectFinalCircularRadius } from '../../domain/circularRadiusQuality'
import { planCircularDemandRadiusSearch } from '../../domain/circularDemandRadiusSearch'
import { useCircularOverflowScroll } from './useCircularOverflowScroll'
import { proposeCircularWhitespaceCenter } from '../../domain/circularWhitespaceSearch'
import {
  collectLayoutViolations,
  layoutEnzymeCallouts,
  layoutEnzymeCalloutsPacked,
  hasNonBoundsLayoutViolations,
  summarizeLeaderBendAngles,
  type EnzymeCalloutLayoutResult,
  type LeaderBendAngleStats,
  type Segment,
} from '../../domain/mapLayout'
import {
  buildRadiusProbeLadder,
  enforceAllOrNoneEnzymeCallouts,
  expectedEnzymeSiteCounts,
  selectEnzymeSitesAllOrNone,
  selectPreferredCircularArcRadius,
} from '../../domain/enzymeLabelBudget'
import {
  CIRCULAR_FEATURE_HALF_WIDTH_PX,
  CIRCULAR_FEATURE_TRACK_START_PX,
  circularMapTitleFitsInsideRing,
  fitCircularContentViewport,
  resolveCircularMapResponsivePolicy,
} from '../../domain/circularMapResponsive'
import {
} from '../../domain/circularLaneRouter'
import {
  circularMapAngle,
  circularMapPolarPoint,
  circularMapPositionFromAngle,
  circularMapStartAngle,
  circularMapSweepRadians,
  circularRulerLabelArc,
  circularRulerLabelRadius,
  CIRCULAR_RULER_LABEL_FONT_PX,
} from '../../domain/circularMapGeometry'
import { circularRulerMarkPositions } from '../../domain/mapRulerMarks'
import { estimateLinearInlineFeatureTextWidthPx } from '../../domain/linearFeatureLabels'
import { featureNoColorStripeThickness, isFeatureNoColor } from '../../domain/featureAppearance'
import {
  primerAnneal3PrimePosition,
  primerAnneal5PrimePosition,
  primerBindingToCalloutSite,
} from '../../domain/sequence'
import type { PrimerBinding, RestrictionSite, SequenceFeature, SequenceRecord } from '../../domain/types'
import type { StrandPairSelection } from '../../domain/sequence'
import { featureArrowForPiece, type FeatureArrowDirection } from '../../domain/featureDirectionality'
import {
  assignFeatureLevels,
  constrainCircularFeatureLevels,
  featureDrawableSegments,
  featureGapConnectors,
  featureLevelBand,
  featureTypeHasArrow,
  isRulerTrackFeature,
  type FeatureRenderInfo,
} from './featureRendering'
import {
  CleavageArrowMark,
  EnzymeCalloutLabelText,
  MapCalloutLabelContent,
  SelectedMapCalloutLabel,
  SelectedPrimerMapLabel,
} from './mapComponents'
import { enzymeCalloutMatchesHover, mapCalloutLabelParts, mapCalloutLabelWidth, mapCalloutTextOriginX } from './mapCalloutLabel'
import {
  circularMapRulerSelectBandPath,
  calloutLabelForSite,
  cleavageArrowsOnSegment,
  contrastTextColor,
  darkThemePrimerColor,
  enzymeSiteCounts,
  featureDisplayName,
  hashString,
  measureTextWidthPx,
  openEnzymeInfoFromCalloutGroup,
  orfCoreColor,
  orfGlowColor,
  primerIsSelectedOnMap,
  primerMapAccentColor,
  restrictionSiteFromCalloutClick,
  restrictionSiteIsSelected,
  resolveEnzymeLabelBudget,
  siteKey,
  sgRnaCalloutSite,
  sgRnaVisualParts,
  type RestrictionSiteList,
  type SelectionRange,
} from './mapPrimitives'
import type { LabelRouterClient } from '../../domain/labelRouterClient'
import { useLabelRouterFactory } from './labelRouterContext'
import { BoundedCache } from '../../domain/boundedCache'
import { actionProfileSync } from '../../domain/actionProfiler'
import { ROUTER_KIND, type RouterInput } from '../../domain/wasmRouterProtocol'
import { parseCircularMapDebugOptions } from './circularMapDebugOptions'
import {
  buildViewportKey,
  circularLayoutKey,
  readPersistedRadius,
  readPersistedStandardFeasible,
  readWarmRadius,
  writePersistedRadius,
  writeWarmRadius,
} from './circularMapRadiusCache'
import {
  elapsedMs,
  logRouterProfile,
  routerPerformanceClock,
  translateCircularArcPath,
  type RouterClock,
  type RouterProfileEntry,
} from './circularMapDiagnostics'
import { createCircularMapLayoutHelpers, splitCircularFeatureCallouts } from './circularMapLayoutHelpers'

export type CircularMapDisplaySettings = {
  enzymes: { visible: boolean; showPositions: boolean }
  features: { labelsVisible: boolean; externalLabels: boolean }
  primers: { visible: boolean }
  labelRouting: {
    minMapRadiusRatio: number
    softRingFloorDiameterRatio: number
    autoRingScaleRatio?: number
    labelCurveShape?: 'ellipse' | 'arcs'
    ellipticRingGap: number
    ellipticSideBudget: number | null
    ellipticHorizontalGapPx: number | null
    ellipticVerticalGapPx: number | null
    arcHorizontalGapPx?: number | null
    arcHalvesLinked?: boolean
    arcUpperVerticalGapPx?: number | null
    arcLowerVerticalGapPx?: number | null
    arcUpperTipAngleDegrees?: number | null
    arcLowerTipAngleDegrees?: number | null
    arcCompactOverflowLabels?: boolean
    ellipticRaySlideEnabled?: boolean
    ellipticRaySlideClearancePx?: number
    ellipticRadialImplodeEnabled?: boolean
    ellipticRadialImplodeClearancePx?: number
    ellipticRadialImplodeMinRingDistancePx?: number
    ellipticBalanceRing?: boolean
    maxEnzymeSiteLabels: number | null
    maxPrimerSiteLabels: number | null
    showAllPrimers: boolean
  }
  circularVisual?: {
    panelOpen?: boolean
    manualLabelPlacement?: boolean
    outsideLabelFontSizePx?: number
    outsideLabelLeaderGapPx?: number
    enzymeFontWeight?: number
    uniqueEnzymeFontWeight?: number
    primerFontWeight?: number
    featureInlineFontSizePx?: number
    featureInlineFontWeight?: number
  }
}

type PrimerCalloutMeta = {
  primerId: string
  color: string
  strand: 'forward' | 'reverse'
  start: number
  end: number
  length: number
  anneal5Prime: number
  anneal3Prime: number
}
type MapLayoutMode = 'standard' | 'packedFallback' | 'arcOverflow'
const SELECTION_MARKER_HALF_LENGTH = 27
const MAX_PRIORITY_OUTER_FEATURE_LABELS = 50
const MAX_SEQUENCE_FOR_OUTER_FEATURE_LABELS = 20_000
const CIRCULAR_ROUTER_CACHE_VERSION = '2026-11-17-finalist-quality'
const CIRCULAR_MAP_CONTENT_PADDING_PX = 10
const CIRCULAR_MAP_BELOW_TITLE_HEIGHT_PX = 54

type FeatureCalloutLayoutEntry =
  | {
      kind: 'inner'
      anchor: { x: number; y: number }
      labelPoint: { x: number; y: number }
      labelPath: string
      labelStart: number
      labelEnd: number
      withLine: boolean
    }
  | {
      kind: 'outer'
      callout: ReturnType<typeof layoutEnzymeCallouts>[number]
      renderLevel: number
    }

type CircularMapBaseLayouts = {
  featureCallouts: Map<string, FeatureCalloutLayoutEntry>
  /** Body track overrides from outer-label re-pack (applied even if the callout was dropped). */
  featureBodyLevels: Map<string, number>
  /** Segment chosen to carry each feature's label (longest fitting body, else longest). */
  preferredLabelSegmentIds: Set<string>
  /** Multi-segment features whose names fit better on an otherwise-empty gap connector. */
  gapLabelConnectors: Map<string, ReturnType<typeof featureGapConnectors>[number]>
  enzymeCallouts: ReturnType<typeof layoutEnzymeCallouts>
  hasOuterFeatureCallouts: boolean
  packedModeUsed: boolean
  mode: MapLayoutMode
  routerInvalid: boolean
  routerComplete: boolean
  routerGeometryViolation?: boolean | null
  profileEntries: RouterProfileEntry[]
  ringCenterX?: number
  ringCenterY?: number
}

type CircularMapLayoutCacheEntry = {
  radiusCacheKey: string
  viewportKey: string
  radius: number
  solvedCallouts: {
    cacheKey: string
    radius: number
    outerFeatureInfos: FeatureRenderInfo[]
    routed: {
      callouts: ReturnType<typeof layoutEnzymeCallouts>
      candidates: Array<{ info: FeatureRenderInfo; site: RestrictionSite }>
      violations: string[]
      baseSiteCount: number
      packedUsed: boolean
      strictInvalid: boolean
      placementFailure?: boolean | null
      nonBoundsGeometryViolation?: boolean | null
      overflowMode?: boolean
      mode: MapLayoutMode
    }
  }
  baseLayouts: CircularMapBaseLayouts
}

type SolvedCalloutsSnapshot = CircularMapLayoutCacheEntry['solvedCallouts']

const circularMapLayoutCache = new BoundedCache<CircularMapLayoutCacheEntry>(4)

export function PlasmidMap<T extends CircularMapDisplaySettings>({
  mapSize,
  viewportWidth,
  viewportHeight,
  minLocked,
  record,
  restrictionSites,
  primerBindings,
  annotationFeatures,
  displaySettings,
  enzymePreferences,
  selectedRange,
  selectionCutStrandPair,
  selectedFeatureId,
  selectedFeatureIds = [],
  selectedPrimerId,
  selectedPrimerIds = [],
  selectedRestrictionSites = [],
  svgIdScope = 'main',
  onSelect,
  onRangeSelect,
  onExtendToBase,
  onPrimerSelect,
  onRestrictionSelect,
  onEnzymeInfo,
  onFeatureEdit,
  onFeatureOpenAsProtein,
  onPrimerEdit,
  onLeaderAngleStatsChange,
  onLayoutModeChange,
  onRenameRecord,
  onEditMapLabel,
}: {
  mapSize: number
  viewportWidth: number
  viewportHeight: number
  minLocked: boolean
  record: SequenceRecord
  restrictionSites: RestrictionSiteList
  primerBindings: PrimerBinding[]
  annotationFeatures: SequenceFeature[]
  displaySettings: T
  enzymePreferences: EnzymePreferences
  selectedRange: SelectionRange | null
  selectionCutStrandPair?: StrandPairSelection | null
  selectedFeatureId: string | null
  selectedFeatureIds?: string[]
  selectedPrimerId: string | null
  selectedPrimerIds?: string[]
  selectedRestrictionSites?: RestrictionSite[]
  /** Prefix for SVG textPath target ids so multiple maps can coexist in the DOM. */
  svgIdScope?: string
  onSelect: (id: string, extendSelection?: boolean, position?: number) => void
  onRangeSelect: (range: SelectionRange) => void
  onExtendToBase?: (position: number) => void
  onPrimerSelect: (primerId: string, extendSelection?: boolean) => void
  onRestrictionSelect: (site: RestrictionSite, extendSelection?: boolean) => void
  onEnzymeInfo: (enzymeName: string) => void
  onFeatureEdit: (id: string) => void
  onFeatureOpenAsProtein?: (id: string) => void
  onPrimerEdit?: (primerId: string) => void
  onLeaderAngleStatsChange?: (stats: LeaderBendAngleStats | null) => void
  onLayoutModeChange?: (mode: MapLayoutMode) => void
  onRenameRecord?: (name: string) => void
  onEditMapLabel?: (label: string) => void
}) {
  const customMapLabel = record.mapLabel?.trim() ? record.mapLabel : ''
  const mapSvgRef = useRef<SVGSVGElement | null>(null)
  const displayedMapLabel = customMapLabel || record.name
  const mapSubtitle = `${record.sequence.length.toLocaleString()} bp ${record.topology}`
  const titleTextWidthEstimate = Math.max(displayedMapLabel.length * 7.4, mapSubtitle.length * 6.4)
  const [editingTitle, setEditingTitle] = useState(false)
  const [hoveredEnzymeName, setHoveredEnzymeName] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState(displayedMapLabel)
  const beginTitleEdit = () => {
    if (!onRenameRecord && !onEditMapLabel) return
    setTitleDraft(displayedMapLabel)
    setEditingTitle(true)
  }
  const commitTitleEdit = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== displayedMapLabel) {
      // When a custom map label is in effect, inline edits update that label;
      // otherwise they rename the file (legacy behavior).
      if (customMapLabel && onEditMapLabel) onEditMapLabel(trimmed)
      else if (onRenameRecord) onRenameRecord(trimmed)
    }
    setEditingTitle(false)
  }
  const cancelTitleEdit = () => setEditingTitle(false)
  const rulerMarks = useMemo(
    () => circularRulerMarkPositions(record.sequence.length),
    [record.sequence.length],
  )
  const enzymeCounts = useMemo(() => enzymeSiteCounts(restrictionSites), [restrictionSites])
  const circularMapDebugOptions = useMemo(
    () => parseCircularMapDebugOptions(typeof window === 'undefined' ? '' : window.location.search),
    [],
  )
  const {
    useWasmRouter,
    useWasmRouterRender,
    routerBenchmarkEnabled,
    routerProfileEnabled,
    routerDebugEnabled,
    routerPackedDebugEnabled,
    circularRouterAlgorithm,
    circularRouterCompareEnabled,
    ellipticOvoidK,
    softRingFloorEnabled,
  } = circularMapDebugOptions
  const outsideLabelFontSizePx = displaySettings.circularVisual?.outsideLabelFontSizePx ?? 12
  const enzymeFontWeight = displaySettings.circularVisual?.enzymeFontWeight ?? 500
  const uniqueEnzymeFontWeight = displaySettings.circularVisual?.uniqueEnzymeFontWeight ?? 800
  const primerFontWeight = displaySettings.circularVisual?.primerFontWeight ?? 600
  const featureInlineFontSizePx = displaySettings.circularVisual?.featureInlineFontSizePx ?? 12
  const featureInlineFontWeight = displaySettings.circularVisual?.featureInlineFontWeight ?? 400
  const circularLabelFontStack = 'system-ui, -apple-system, "Segoe UI", sans-serif'

  const viewportScale = Math.min(viewportWidth, viewportHeight)
  const resolvedEnzymeLabelBudget = useMemo(
    () => displaySettings.labelRouting.maxEnzymeSiteLabels ?? resolveEnzymeLabelBudget(viewportScale),
    [displaySettings.labelRouting.maxEnzymeSiteLabels, viewportScale],
  )
  const prioritizedEnzymeSites = useMemo(
    () =>
      selectEnzymeSitesAllOrNone(restrictionSites, resolvedEnzymeLabelBudget, {
        priorityOrder: enzymePreferences.priorityOrder,
      }),
    [enzymePreferences.priorityOrder, resolvedEnzymeLabelBudget, restrictionSites],
  )
  const mergedEnzymeCallouts = useMemo(() => {
    const byCutTop = new Map<number, RestrictionSite[]>()
    prioritizedEnzymeSites.forEach((site) => {
      const list = byCutTop.get(site.cutTop) ?? []
      list.push(site)
      byCutTop.set(site.cutTop, list)
    })

    const uniqueKeys = new Set<string>()
    const mergedSites = [...byCutTop.entries()]
      .map(([, sitesAtCut]) => {
        const sorted = sitesAtCut.toSorted((a, b) => a.enzyme.name.localeCompare(b.enzyme.name))
        const primary = sorted[0]
        const mergedName = sorted.map((site) => site.enzyme.name).join(', ')
        const mergedSite: RestrictionSite = {
          ...primary,
          enzyme: {
            ...primary.enzyme,
            name: mergedName,
          },
          match: '__enzyme_callout__',
        }
        const isUnique = sorted.every((site) => (enzymeCounts[site.enzyme.name] ?? 0) === 1)
        if (isUnique) uniqueKeys.add(siteKey(mergedSite))
        return mergedSite
      })
      .toSorted((a, b) => a.cutTop - b.cutTop || a.enzyme.name.localeCompare(b.enzyme.name))
    return { sites: mergedSites, uniqueKeys }
  }, [enzymeCounts, prioritizedEnzymeSites])
  const primerCalloutBundle = useMemo(() => {
    if (!displaySettings.primers.visible) {
      return { sites: [] as RestrictionSite[], meta: new Map<string, PrimerCalloutMeta>() }
    }
    const primerSites: RestrictionSite[] = []
    const meta = new Map<string, PrimerCalloutMeta>()
    const primerLimit = displaySettings.labelRouting.showAllPrimers
      ? Number.POSITIVE_INFINITY
      : displaySettings.labelRouting.maxPrimerSiteLabels ?? Number.POSITIVE_INFINITY

    primerBindings.slice(0, primerLimit).forEach((binding, index) => {
      const site = primerBindingToCalloutSite(binding, index)
      primerSites.push(site)
      meta.set(siteKey(site), {
        primerId: binding.primer.id,
        color: binding.primer.color || '#a020f0',
        strand: binding.strand,
        start: binding.start,
        end: binding.end,
        length: Math.max(1, binding.end - binding.start),
        anneal5Prime: primerAnneal5PrimePosition(binding),
        anneal3Prime: primerAnneal3PrimePosition(binding),
      })
    })

    return { sites: primerSites, meta }
  }, [displaySettings.labelRouting.maxPrimerSiteLabels, displaySettings.labelRouting.showAllPrimers, displaySettings.primers.visible, primerBindings])
  const enzymeCalloutSites = mergedEnzymeCallouts.sites
  const uniqueEnzymeCalloutKeys = mergedEnzymeCallouts.uniqueKeys
  const sgRnaCalloutBundle = useMemo(() => {
    const annotations = groupSgRNAFeatures(annotationFeatures)
    const sites = annotations.map(sgRnaCalloutSite)
    return { sites, meta: new Map(sites.map((site, index) => [siteKey(site), annotations[index]!])) }
  }, [annotationFeatures])
  const sgRnaCalloutMeta = sgRnaCalloutBundle.meta
  const primerCalloutSites = useMemo(
    () => [...primerCalloutBundle.sites, ...sgRnaCalloutBundle.sites],
    [primerCalloutBundle.sites, sgRnaCalloutBundle.sites],
  )
  const labeledSites = useMemo(() => [...enzymeCalloutSites, ...primerCalloutSites], [enzymeCalloutSites, primerCalloutSites])
  const showEnzymePositions = displaySettings.enzymes.showPositions
  const outsideLabelLeaderGapPx = displaySettings.circularVisual?.outsideLabelLeaderGapPx ?? 6
  const maxCalloutLabelWidthEstimate = useMemo(() => {
    let widest = labeledSites.reduce((current, site) => {
      const label = calloutLabelForSite(site, showEnzymePositions)
      const fallback = site.match === '__feature_callout__' ? 6.8 : isSgRnaCalloutSite(site) ? 6.2 : site.match.startsWith('__primer_callout__') ? 7 : 6
      const font =
        site.match === '__feature_callout__'
          ? `750 ${outsideLabelFontSizePx + 2}px ${circularLabelFontStack}`
          : isSgRnaCalloutSite(site)
            ? sgRnaMapCalloutLabelFont(circularLabelFontStack)
            : site.match.startsWith('__primer_callout__')
              ? `${Math.max(400, primerFontWeight)} ${outsideLabelFontSizePx}px ${circularLabelFontStack}`
              : (() => {
                  const style = enzymeLabelDisplayStyle(site, enzymePreferences, enzymeCounts)
                  return `${Math.max(400, style.bold ? uniqueEnzymeFontWeight : enzymeFontWeight)} ${outsideLabelFontSizePx}px ${circularLabelFontStack}`
                })()
      const padding = site.match === '__feature_callout__'
        ? 18
        : isSgRnaCalloutSite(site)
          ? 6
          : (site.match.startsWith('__primer_callout__') ? 12 : 6) + outsideLabelLeaderGapPx
      const width = site.match === '__feature_callout__' || isSgRnaCalloutSite(site)
        ? measureTextWidthPx(label, font, fallback)
        : mapCalloutLabelWidth(label, site.match.startsWith('__primer_callout__') ? 'primer' : 'enzyme', (text) => measureTextWidthPx(text, font, fallback))
      return Math.max(current, width + padding)
    }, 0)
    if (
      displaySettings.features.labelsVisible &&
      displaySettings.features.externalLabels &&
      record.sequence.length <= MAX_SEQUENCE_FOR_OUTER_FEATURE_LABELS
    ) {
      widest = annotationFeatures.filter((feature) => !isOrfFeature(feature)).reduce(
        (current, feature) =>
          Math.max(
            current,
            measureTextWidthPx(
              featureDisplayName(feature),
              `750 ${outsideLabelFontSizePx + 2}px ${circularLabelFontStack}`,
              6.8,
            ) + 18,
          ),
        widest,
      )
    }
    return widest
  }, [annotationFeatures, displaySettings.features.externalLabels, displaySettings.features.labelsVisible, labeledSites, outsideLabelFontSizePx, outsideLabelLeaderGapPx, record.sequence.length, showEnzymePositions, enzymeCounts, enzymeFontWeight, enzymePreferences, primerFontWeight, uniqueEnzymeFontWeight])
  const responsiveMapPolicy = useMemo(() => {
    return resolveCircularMapResponsivePolicy({
      viewportWidth,
      viewportHeight,
      mapSize,
      algorithm: circularRouterAlgorithm,
      maxLabelWidth: maxCalloutLabelWidthEstimate,
      ringGap: displaySettings.labelRouting.ellipticRingGap,
      configuredSideBudget: displaySettings.labelRouting.ellipticSideBudget ?? undefined,
      minMapRadiusRatio: displaySettings.labelRouting.minMapRadiusRatio,
      softRingFloorDiameterRatio: displaySettings.labelRouting.softRingFloorDiameterRatio,
      autoRingScaleRatio: displaySettings.labelRouting.autoRingScaleRatio ?? 1,
      softRingFloorEnabled,
    })
  }, [
    circularRouterAlgorithm,
    displaySettings.labelRouting.ellipticRingGap,
    displaySettings.labelRouting.ellipticSideBudget,
    displaySettings.labelRouting.minMapRadiusRatio,
    displaySettings.labelRouting.softRingFloorDiameterRatio,
    displaySettings.labelRouting.autoRingScaleRatio,
    mapSize,
    maxCalloutLabelWidthEstimate,
    softRingFloorEnabled,
    viewportHeight,
    viewportWidth,
  ])
  const primerCalloutMeta = primerCalloutBundle.meta
  const rulerTrackFeatures = useMemo(
    () => annotationFeatures.filter(isRulerTrackFeature),
    [annotationFeatures],
  )
  const sgRnaParts = useMemo(() => sgRnaVisualParts(annotationFeatures), [annotationFeatures])
  const sgRnaMapSegments = useMemo(
    () => sgRnaVisualSegments(groupSgRNAFeatures(annotationFeatures), record.sequence),
    [annotationFeatures, record.sequence],
  )
  const standardAnnotationFeatures = useMemo(
    () => annotationFeatures.filter((feature) => !isOrfFeature(feature) && !isRulerTrackFeature(feature) && !sgRnaParts.has(feature.id)),
    [annotationFeatures, sgRnaParts],
  )
  const orfAnnotationFeatures = useMemo(
    () => annotationFeatures.filter((feature) => isOrfFeature(feature) && !isRulerTrackFeature(feature)),
    [annotationFeatures],
  )
  const allRenderedFeatures = useMemo(
    () => assignFeatureLevels([...standardAnnotationFeatures, ...orfAnnotationFeatures], record.sequence.length),
    [orfAnnotationFeatures, record.sequence.length, standardAnnotationFeatures],
  )
  // Safe pre-layout cap based on the largest radius this policy can select. The final render
  // tightens it once the exact radius is known.
  const visibleLevelLimit = responsiveMapPolicy.featureLevelLimit
  const renderedFeatures = useMemo(
    () =>
      constrainCircularFeatureLevels(
        allRenderedFeatures.filter((feature) => !isOrfFeature(feature.feature)),
        visibleLevelLimit,
        true,
      ),
    [allRenderedFeatures, visibleLevelLimit],
  )
  const orfRenderedFeatures = useMemo(
    () =>
      constrainCircularFeatureLevels(
        allRenderedFeatures.filter((feature) => isOrfFeature(feature.feature)),
        visibleLevelLimit,
        false,
      ),
    [allRenderedFeatures, visibleLevelLimit],
  )
  const layoutMapWidth = Math.max(mapSize, viewportWidth)
  const layoutMapHeight = Math.max(mapSize, viewportHeight)
  const layoutMapSize = Math.max(layoutMapWidth, layoutMapHeight)
  const centerX = layoutMapWidth / 2
  const centerY = layoutMapHeight / 2
  // Updated after elliptic layout to the maximin ring center among labels (see baseLayouts).
  let drawCenterX = centerX
  let drawCenterY = centerY
  const enzymeOuterOffset = 18
  /** Radial offset of primer annealed lines from the circular backbone midline. */
  const PRIMER_RULER_OFFSET_PX = 8
  const nominalFeatureTrackGap = 42
  const allowOuterFeatureLabels = displaySettings.features.externalLabels && record.sequence.length <= MAX_SEQUENCE_FOR_OUTER_FEATURE_LABELS
  const prioritizedOuterFeatureBudget = MAX_PRIORITY_OUTER_FEATURE_LABELS
  const createLabelRouter = useLabelRouterFactory()
  const routerClientRef = useRef<LabelRouterClient | null>(null)
  const [workerEnzymeCallouts, setWorkerEnzymeCallouts] = useState<ReturnType<typeof layoutEnzymeCallouts> | null>(null)
  const [wasmWorkerOverlayAllowedPrev, setWasmWorkerOverlayAllowedPrev] = useState(false)
  const workerBenchmarkKeyRef = useRef<string>('')
  const labeledSitesSignature = useMemo(
    () => hashString(labeledSites.map((site) => `${site.match}:${site.enzyme.name}:${site.start}:${site.cutTop}:${site.cutBottom}`).join('|')).toString(16),
    [labeledSites],
  )
  const renderedFeaturesSignature = useMemo(
    () =>
      hashString(
        renderedFeatures
          .map(
            (feature) =>
              `${feature.segmentId}:${feature.level}:${feature.start}:${feature.end}:${featureDisplayName(feature.feature)}:${feature.feature.prioritizeDisplay ? 1 : 0}`,
          )
          .join('|'),
      ).toString(16),
    [renderedFeatures],
  )
  const radiusCacheKey = useMemo(
    () =>
      [
        CIRCULAR_ROUTER_CACHE_VERSION,
        `algo=${circularRouterAlgorithm}`,
        `ovoidK=${ellipticOvoidK.toFixed(3)}`,
        `record=${record.id}`,
        `title=${hashString(displayedMapLabel).toString(16)}`,
        `updated=${record.updatedAt}`,
        `sequence=${hashString(record.sequence).toString(16)}`,
        `topo=${record.topology}`,
        record.sequence.length,
        mapSize,
        viewportWidth,
        viewportHeight,
        displaySettings.features.labelsVisible ? 'fl1' : 'fl0',
        displaySettings.features.externalLabels ? 'fe1' : 'fe0',
        displaySettings.enzymes.showPositions ? 'ep1' : 'ep0',
        displaySettings.labelRouting.minMapRadiusRatio.toFixed(4),
        `softFloorDiameter=${displaySettings.labelRouting.softRingFloorDiameterRatio.toFixed(4)}`,
        `autoRingScale=${(displaySettings.labelRouting.autoRingScaleRatio ?? 1).toFixed(4)}`,
        `curve=${displaySettings.labelRouting.labelCurveShape ?? 'arcs'}`,
        `ringGap=${displaySettings.labelRouting.ellipticRingGap}`,
        `sideBudget=${displaySettings.labelRouting.ellipticSideBudget ?? 'auto'}`,
        `ovalH=${displaySettings.labelRouting.ellipticHorizontalGapPx ?? 'auto'}`,
        `ovalV=${displaySettings.labelRouting.ellipticVerticalGapPx ?? 'auto'}`,
        `arcH=${displaySettings.labelRouting.arcHorizontalGapPx ?? 'auto'}`,
        `arcLink=${displaySettings.labelRouting.arcHalvesLinked ? 1 : 0}`,
        `arcUpperV=${displaySettings.labelRouting.arcUpperVerticalGapPx ?? 'auto'}`,
        `arcLowerV=${displaySettings.labelRouting.arcLowerVerticalGapPx ?? 'auto'}`,
        `arcUpperTip=${displaySettings.labelRouting.arcUpperTipAngleDegrees ?? 'auto'}`,
        `arcLowerTip=${displaySettings.labelRouting.arcLowerTipAngleDegrees ?? 'auto'}`,
        `arcCompactOverflow=${displaySettings.labelRouting.arcCompactOverflowLabels ? 1 : 0}`,
        `resolvedSide=${responsiveMapPolicy.sideBudgetOverride ?? 'none'}`,
        `labelBand=${maxCalloutLabelWidthEstimate.toFixed(1)}`,
        `policyMax=${responsiveMapPolicy.maxRadius}`,
        `raySlide=${displaySettings.labelRouting.ellipticRaySlideEnabled === true ? 1 : 0}`,
        `rayClear=${(displaySettings.labelRouting.ellipticRaySlideClearancePx ?? 4).toFixed(2)}`,
        `radImp=${displaySettings.labelRouting.ellipticRadialImplodeEnabled === true ? 1 : 0}`,
        `radClear=${(displaySettings.labelRouting.ellipticRadialImplodeClearancePx ?? 4).toFixed(2)}`,
        `radRing=${(displaySettings.labelRouting.ellipticRadialImplodeMinRingDistancePx ?? 24).toFixed(1)}`,
        `balRing=${displaySettings.labelRouting.ellipticBalanceRing === false ? 0 : 1}`,
        `fs=${displaySettings.circularVisual?.outsideLabelFontSizePx ?? 12}`,
        `leaderGap=${displaySettings.circularVisual?.outsideLabelLeaderGapPx ?? 6}`,
        `fwE=${displaySettings.circularVisual?.enzymeFontWeight ?? 500}`,
        `fwU=${displaySettings.circularVisual?.uniqueEnzymeFontWeight ?? 800}`,
        `fwP=${displaySettings.circularVisual?.primerFontWeight ?? 600}`,
        `ffs=${displaySettings.circularVisual?.featureInlineFontSizePx ?? 12}`,
        `ffw=${displaySettings.circularVisual?.featureInlineFontWeight ?? 400}`,
        softRingFloorEnabled ? 'srf1' : 'srf0',
        labeledSitesSignature,
        renderedFeaturesSignature,
      ].join('|'),
    [
      circularRouterAlgorithm,
      ellipticOvoidK,
      softRingFloorEnabled,
      displaySettings.enzymes.showPositions,
      displaySettings.features.externalLabels,
      displaySettings.features.labelsVisible,
      displaySettings.labelRouting.minMapRadiusRatio,
      displaySettings.labelRouting.softRingFloorDiameterRatio,
      displaySettings.labelRouting.autoRingScaleRatio,
      displaySettings.labelRouting.labelCurveShape,
      displaySettings.labelRouting.ellipticRingGap,
      displaySettings.labelRouting.ellipticSideBudget,
      displaySettings.labelRouting.ellipticHorizontalGapPx,
      displaySettings.labelRouting.ellipticVerticalGapPx,
      displaySettings.labelRouting.arcHorizontalGapPx,
      displaySettings.labelRouting.arcHalvesLinked,
      displaySettings.labelRouting.arcUpperVerticalGapPx,
      displaySettings.labelRouting.arcLowerVerticalGapPx,
      displaySettings.labelRouting.arcUpperTipAngleDegrees,
      displaySettings.labelRouting.arcLowerTipAngleDegrees,
      displaySettings.labelRouting.arcCompactOverflowLabels,
      displaySettings.labelRouting.ellipticRaySlideEnabled,
      displaySettings.labelRouting.ellipticRaySlideClearancePx,
      displaySettings.labelRouting.ellipticRadialImplodeEnabled,
      displaySettings.labelRouting.ellipticRadialImplodeClearancePx,
      displaySettings.labelRouting.ellipticRadialImplodeMinRingDistancePx,
      displaySettings.labelRouting.ellipticBalanceRing,
      displaySettings.circularVisual?.outsideLabelFontSizePx,
      displaySettings.circularVisual?.outsideLabelLeaderGapPx,
      displaySettings.circularVisual?.enzymeFontWeight,
      displaySettings.circularVisual?.uniqueEnzymeFontWeight,
      displaySettings.circularVisual?.primerFontWeight,
      displaySettings.circularVisual?.featureInlineFontSizePx,
      displaySettings.circularVisual?.featureInlineFontWeight,
      labeledSitesSignature,
      mapSize,
      maxCalloutLabelWidthEstimate,
      record.id,
      displayedMapLabel,
      record.updatedAt,
      record.sequence,
      viewportHeight,
      viewportWidth,
      record.topology,
      renderedFeaturesSignature,
      responsiveMapPolicy.maxRadius,
      responsiveMapPolicy.sideBudgetOverride,
    ],
  )

  type ManualLabelPose = {
    connectorEnd: { x: number; y: number }
    elbow: { x: number; y: number }
    x: number
    textAnchor: 'start' | 'end'
  }
  const manualLabelPlacement = displaySettings.circularVisual?.manualLabelPlacement === true
  const manualPlacementEpoch = `${radiusCacheKey}|${viewportWidth}x${viewportHeight}`
  const [manualLabelEpoch, setManualLabelEpoch] = useState(manualPlacementEpoch)
  const [manualLabelPoses, setManualLabelPoses] = useState<Map<string, ManualLabelPose>>(() => new Map())
  const [draggingLabelKey, setDraggingLabelKey] = useState<string | null>(null)
  if (manualPlacementEpoch !== manualLabelEpoch) {
    setManualLabelEpoch(manualPlacementEpoch)
    setManualLabelPoses(new Map())
    setDraggingLabelKey(null)
  }

  type RoutedCalloutSnapshot = {
    callouts: ReturnType<typeof layoutEnzymeCallouts>
    candidates: Array<{ info: FeatureRenderInfo; site: RestrictionSite }>
    violations: string[]
    baseSiteCount: number
    packedUsed: boolean
    strictInvalid: boolean
    placementFailure?: boolean | null
    nonBoundsGeometryViolation?: boolean | null
    overflowMode?: boolean
    routingQuality?: EnzymeCalloutLayoutResult['routingQuality']
    mode: MapLayoutMode
    ringCenterX?: number
    ringCenterY?: number
  }
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const liveRange = dragStart !== null && dragEnd !== null ? { start: dragStart, end: dragEnd } : selectedRange
  const enzymeTooltip = useEnzymeHoverTooltip()
  const selectionOffset = record.topology === 'circular' ? 0 : 7

  useEffect(() => {
    if (!useWasmRouter) {
      routerClientRef.current?.dispose()
      routerClientRef.current = null
      return
    }
    if (!routerClientRef.current && createLabelRouter) routerClientRef.current = createLabelRouter()
    return () => {
      routerClientRef.current?.dispose()
      routerClientRef.current = null
    }
  }, [useWasmRouter, createLabelRouter])

  function point(position: number, offset = 0, baseRadius = radius) {
    return circularMapPolarPoint(position, record.sequence.length, drawCenterX, drawCenterY, baseRadius, offset, record.topology)
  }

  function featureSpan(info: FeatureRenderInfo) {
    return info.end >= info.start ? info.end - info.start : record.sequence.length - info.start + info.end
  }

  function arcForRange(startPosition: number, endPosition: number, offset = 0, baseRadius = radius) {
    return arcForRangeDirected(startPosition, endPosition, offset, baseRadius, 1)
  }

  function arcForRangeDirected(
    startPosition: number,
    endPosition: number,
    offset = 0,
    baseRadius = radius,
    sweepFlag: 0 | 1 = 1,
    explicitSpan?: number,
  ) {
    const start = point(startPosition, offset, baseRadius)
    const end = point(endPosition, offset, baseRadius)
    const length = Math.max(1, record.sequence.length)
    const rawSpan =
      explicitSpan ??
      (endPosition >= startPosition
        ? endPosition - startPosition
        : record.topology === 'linear'
          ? Math.abs(endPosition - startPosition)
          : length - startPosition + endPosition)
    const span = Math.max(1, rawSpan)
    const angularSpan = (span / length) * circularMapSweepRadians(record.topology)
    const largeArc = angularSpan > Math.PI ? 1 : 0
    return `M ${start.x} ${start.y} A ${baseRadius + offset} ${baseRadius + offset} 0 ${largeArc} ${sweepFlag} ${end.x} ${end.y}`
  }

  function selectFromDrag(start: number, end: number) {
    if (start === end) {
      onRangeSelect({ start, end: Math.min(record.sequence.length, start + 1) })
      return
    }
    if (record.topology === 'linear') {
      onRangeSelect(start < end ? { start, end } : { start: end, end: start })
      return
    }
    onRangeSelect({ start, end })
  }

  function clockHand(position: number, className: string) {
    const inner = point(position, selectionOffset - SELECTION_MARKER_HALF_LENGTH)
    const outer = point(position, selectionOffset + SELECTION_MARKER_HALF_LENGTH)
    return <line className={className} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
  }

  function featureArrowPoints(info: FeatureRenderInfo, halfWidth = 12, tipPadding = 0, basePadding = 0, side?: 'forward' | 'reverse') {
    const trackRadius = featureRadius(info.level)
    const arrowBases = featureArrowBases(info)
    const pointsRight = side ? side === 'forward' : info.strand === 'forward'
    const tipPosition = pointsRight ? info.end : info.start
    const basePosition = pointsRight ? Math.max(info.start + 1, info.end - arrowBases) : Math.min(info.end - 1, info.start + arrowBases)
    const tip = point(tipPosition, 0, trackRadius)
    const base = point(basePosition, 0, trackRadius)
    const dx = tip.x - base.x
    const dy = tip.y - base.y
    const length = Math.max(1, Math.hypot(dx, dy))
    const ux = dx / length
    const uy = dy / length
    const px = -dy / length
    const py = dx / length
    const paddedTip = { x: tip.x + ux * tipPadding, y: tip.y + uy * tipPadding }
    const paddedBase = { x: base.x - ux * basePadding, y: base.y - uy * basePadding }
    const sideA = { x: paddedBase.x + px * halfWidth, y: paddedBase.y + py * halfWidth }
    const sideB = { x: paddedBase.x - px * halfWidth, y: paddedBase.y - py * halfWidth }
    return { tip: paddedTip, sideA, sideB, base: paddedBase, px, py }
  }

  function featureArrow(info: FeatureRenderInfo, halfWidth = 12, tipPadding = 0, basePadding = 0, side?: 'forward' | 'reverse') {
    const { tip, sideA, sideB } = featureArrowPoints(info, halfWidth, tipPadding, basePadding, side)
    return `${tip.x},${tip.y} ${sideA.x},${sideA.y} ${sideB.x},${sideB.y}`
  }

  function featureArrowOutline(info: FeatureRenderInfo, halfWidth = 12, tipPadding = 0, basePadding = 0, side?: 'forward' | 'reverse') {
    const { tip, sideA, sideB } = featureArrowPoints(info, halfWidth, tipPadding, basePadding, side)
    return `M ${sideA.x} ${sideA.y} L ${tip.x} ${tip.y} L ${sideB.x} ${sideB.y}`
  }

  function featureArrowBases(info: FeatureRenderInfo) {
    const trackRadius = featureRadius(info.level)
    const targetPixels = 16
    return Math.max(1, Math.round((targetPixels / (circularMapSweepRadians(record.topology) * trackRadius)) * record.sequence.length))
  }

  function featureDrawableArrow(info: FeatureRenderInfo): FeatureArrowDirection {
    if (!info.feature.directionality && !featureTypeHasArrow(info.feature.type)) return 'none'
    const arrow = featureArrowForPiece(info)
    return arrow !== 'none' && featureSpan(info) < featureArrowBases(info) * 2 ? 'none' : arrow
  }

  function featureBodyArc(info: FeatureRenderInfo, arrow: FeatureArrowDirection) {
    if (arrow === 'none') return arcForRange(info.start, info.end, 0, featureRadius(info.level))

    const arrowBases = featureArrowBases(info)
    const bodyStart = arrow === 'reverse' || arrow === 'both' ? Math.min(info.end - 1, info.start + arrowBases) : info.start
    const bodyEnd = arrow === 'forward' || arrow === 'both' ? Math.max(info.start + 1, info.end - arrowBases) : info.end
    return arcForRange(bodyStart, bodyEnd, 0, featureRadius(info.level))
  }

  // Builds a single closed outline for a feature body (with optional arrowhead) as an
  // annular sector of constant width. Using one path for both orientations guarantees the
  // same body width and a border that wraps every edge (arcs and radial caps) at a uniform
  // thickness. The arrowhead flares out to flaps (shoulders) wider than the shaft, but is
  // part of the same path so the border stays continuous with no bumps at the joints.
  function featureBandPath(info: FeatureRenderInfo, halfWidth: number, arrow: FeatureArrowDirection) {
    const trackRadius = featureRadius(info.level)
    const rOuter = trackRadius + halfWidth
    const rInner = trackRadius - halfWidth
    const flapWidth = halfWidth + 4.25
    const length = record.sequence.length
    const sweep = circularMapSweepRadians(record.topology)
    const arrowBases = arrow !== 'none' ? featureArrowBases(info) : 0

    let bodyStart = info.start
    let bodyEnd = info.end
    if (arrow === 'reverse' || arrow === 'both') bodyStart = Math.min(info.end - 1, info.start + arrowBases)
    if (arrow === 'forward' || arrow === 'both') bodyEnd = Math.max(info.start + 1, info.end - arrowBases)

    const bodySpan = Math.max(0, bodyEnd - bodyStart)
    const largeArc = (bodySpan / length) * sweep > Math.PI ? 1 : 0
    const outerStart = point(bodyStart, halfWidth, trackRadius)
    const outerEnd = point(bodyEnd, halfWidth, trackRadius)
    const innerStart = point(bodyStart, -halfWidth, trackRadius)
    const innerEnd = point(bodyEnd, -halfWidth, trackRadius)

    if (arrow === 'none') {
      return `M ${outerStart.x} ${outerStart.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`
    }

    if (arrow === 'both') {
      const startFlapOuter = point(bodyStart, flapWidth, trackRadius)
      const startFlapInner = point(bodyStart, -flapWidth, trackRadius)
      const startTip = point(info.start, 0, trackRadius)
      const endFlapOuter = point(bodyEnd, flapWidth, trackRadius)
      const endFlapInner = point(bodyEnd, -flapWidth, trackRadius)
      const endTip = point(info.end, 0, trackRadius)
      return `M ${outerStart.x} ${outerStart.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${endFlapOuter.x} ${endFlapOuter.y} L ${endTip.x} ${endTip.y} L ${endFlapInner.x} ${endFlapInner.y} L ${innerEnd.x} ${innerEnd.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} L ${startFlapInner.x} ${startFlapInner.y} L ${startTip.x} ${startTip.y} L ${startFlapOuter.x} ${startFlapOuter.y} Z`
    }

    if (arrow === 'forward') {
      const flapOuter = point(bodyEnd, flapWidth, trackRadius)
      const flapInner = point(bodyEnd, -flapWidth, trackRadius)
      const tip = point(info.end, 0, trackRadius)
      return `M ${outerStart.x} ${outerStart.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${flapOuter.x} ${flapOuter.y} L ${tip.x} ${tip.y} L ${flapInner.x} ${flapInner.y} L ${innerEnd.x} ${innerEnd.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`
    }

    const flapOuter = point(bodyStart, flapWidth, trackRadius)
    const flapInner = point(bodyStart, -flapWidth, trackRadius)
    const tip = point(info.start, 0, trackRadius)
    return `M ${outerStart.x} ${outerStart.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} L ${flapInner.x} ${flapInner.y} L ${tip.x} ${tip.y} L ${flapOuter.x} ${flapOuter.y} Z`
  }

  const mapLayoutHelpers = useMemo(() => {
    function circularCalloutFontLocal(site: RestrictionSite) {
      if (site.match === '__feature_callout__') {
        return `750 ${outsideLabelFontSizePx + 2}px ${circularLabelFontStack}`
      }
      if (isSgRnaCalloutSite(site)) {
        return sgRnaMapCalloutLabelFont(circularLabelFontStack)
      }
      if (site.match.startsWith('__primer_callout__')) {
        return `${Math.max(400, primerFontWeight)} ${outsideLabelFontSizePx}px ${circularLabelFontStack}`
      }
      const style = enzymeLabelDisplayStyle(site, enzymePreferences, enzymeCounts)
      const weight = style.bold ? uniqueEnzymeFontWeight : enzymeFontWeight
      return `${Math.max(400, weight)} ${outsideLabelFontSizePx}px ${circularLabelFontStack}`
    }
    function circularCalloutPaddingLocal(site: RestrictionSite) {
      if (site.match === '__feature_callout__') return 18
      if (isSgRnaCalloutSite(site)) return 6
      return (site.match.startsWith('__primer_callout__') ? 12 : 6) + outsideLabelLeaderGapPx
    }
    function circularCalloutTextWidthLocal(site: RestrictionSite, label: string) {
      const fallback = site.match === '__feature_callout__'
        ? 6.8
        : isSgRnaCalloutSite(site)
          ? 6.2
          : site.match.startsWith('__primer_callout__')
            ? 7
            : 6
      const measure = (text: string) => measureTextWidthPx(text, circularCalloutFontLocal(site), fallback)
      if (site.match === '__feature_callout__' || isSgRnaCalloutSite(site)) return measure(label)
      return mapCalloutLabelWidth(label, site.match.startsWith('__primer_callout__') ? 'primer' : 'enzyme', measure)
    }
    return createCircularMapLayoutHelpers({
      record,
      centerX,
      centerY,
      responsiveMapPolicy,
      featureTrackStart: CIRCULAR_FEATURE_TRACK_START_PX,
      nominalFeatureTrackGap,
      renderedFeatures,
      orfRenderedFeatures,
      featureInlineFontSizePx,
      titleTextWidthEstimate,
      displaySettings,
      allowOuterFeatureLabels,
      circularRouterAlgorithm,
      circularRouterCompareEnabled,
      routerProfileEnabled,
      routerPackedDebugEnabled,
      layoutMapSize,
      layoutMapWidth,
      layoutMapHeight,
      enzymeOuterOffset,
      ellipticOvoidK,
      showEnzymePositions,
      outsideLabelFontSizePx,
      enzymeCalloutSites,
      primerCalloutSites,
      prioritizedOuterFeatureBudget,
      mapSize,
      circularCalloutPadding: circularCalloutPaddingLocal,
      circularCalloutTextWidth: circularCalloutTextWidthLocal,
      includeViolationDetails: routerDebugEnabled,
      renderedCalloutAnchor: (callout, ringCenter, mapRadius) => {
        const primer = primerCalloutMeta.get(siteKey(callout.site))
        if (primer) {
          return circularMapPolarPoint(
            primer.anneal5Prime, record.sequence.length, ringCenter.x, ringCenter.y,
            primer.strand === 'forward' ? mapRadius + PRIMER_RULER_OFFSET_PX : mapRadius - PRIMER_RULER_OFFSET_PX,
            0, record.topology,
          )
        }
        const guide = sgRnaCalloutMeta.get(siteKey(callout.site))
        return guide
          ? sgRnaCircularLeaderAnchor(guide, record.sequence.length, ringCenter.x, ringCenter.y, mapRadius, record.topology)
          : callout.anchor
      },
    })
  }, [
    allowOuterFeatureLabels,
    centerX,
    centerY,
    circularRouterAlgorithm,
    circularRouterCompareEnabled,
    displaySettings,
    ellipticOvoidK,
    circularLabelFontStack,
    enzymeCalloutSites,
    enzymeCounts,
    enzymeFontWeight,
    enzymeOuterOffset,
    enzymePreferences,
    featureInlineFontSizePx,
    layoutMapHeight,
    layoutMapSize,
    layoutMapWidth,
    mapSize,
    nominalFeatureTrackGap,
    orfRenderedFeatures,
    outsideLabelFontSizePx,
    outsideLabelLeaderGapPx,
    primerCalloutSites,
    primerCalloutMeta,
    primerFontWeight,
    prioritizedOuterFeatureBudget,
    record,
    renderedFeatures,
    responsiveMapPolicy,
    routerPackedDebugEnabled,
    routerDebugEnabled,
    routerProfileEnabled,
    showEnzymePositions,
    sgRnaCalloutMeta,
    titleTextWidthEstimate,
    uniqueEnzymeFontWeight,
  ])

  const radiusSolve = useMemo(() => {
    const { featureCalloutPlanAtRadius, routableCombinedCallouts, titleFitsInsideAtRadius } = mapLayoutHelpers
      function resolveCircularMapRadius(
        profileClock: RouterClock | null,
        options: { skipLayoutCache: boolean; skipPersistedCache: boolean; skipSideEffects: boolean },
      ) {
        return actionProfileSync('circularMapRadius', 'map', () => {
        const viewportKey = buildViewportKey(viewportWidth, viewportHeight, mapSize, minLocked)
        if (!options.skipLayoutCache) {
          const cachedMapLayout = circularMapLayoutCache.get(circularLayoutKey(radiusCacheKey, viewportKey))
          if (cachedMapLayout) {
            return {
              radius: cachedMapLayout.radius,
              radiusSearchSnapshot: cachedMapLayout.solvedCallouts,
              radiusProfile: routerProfileEnabled
                ? [
                    {
                      step: 'radius.layoutCacheHit',
                      ms: 0,
                      details: `resolved=${cachedMapLayout.radius}`,
                    },
                  ]
                : [],
              persistRadius: null,
              warmRadius: null,
            }
          }
        }

        const isElliptic = circularRouterAlgorithm === 'elliptic'
        const {
          hardMinRadius,
          searchMinRadius,
          maxRadius,
          softFloorRadius,
          softTargetRadius,
        } = responsiveMapPolicy
        const jointlyOptimizeArcs =
          isElliptic && (displaySettings.labelRouting.labelCurveShape ?? 'arcs') === 'arcs'
        // Start at the readable soft floor. If every finished route in that band is invalid,
        // bounded recovery below may try smaller radii while preserving feature-track space.
        const ellipticSearchLow = isElliptic
          ? Math.max(hardMinRadius, softFloorRadius ?? hardMinRadius)
          : searchMinRadius
        const profile: RouterProfileEntry[] = []
        const evaluated = new Map<
          string,
          {
            feasible: boolean
            outerFeatureInfos: FeatureRenderInfo[]
            routed: RoutedCalloutSnapshot
          }
        >()

        function evaluate(
          candidateRadius: number,
          step: string,
          optimizationPass: 'coarse' | 'final' = jointlyOptimizeArcs ? 'coarse' : 'final',
          centerOverride?: { x: number; y: number },
        ) {
          const evaluationKey = `${candidateRadius}:${optimizationPass}:${centerOverride ? `${centerOverride.x},${centerOverride.y}` : 'default'}`
          const cached = evaluated.get(evaluationKey)
          if (cached) return cached
          const started = profileClock ? profileClock.now() : 0
          const featurePlan = featureCalloutPlanAtRadius(candidateRadius)
          if (isElliptic) titleFitsInsideAtRadius(candidateRadius, featurePlan.layouts)
          const { outerFeatureInfos } = featurePlan
          const routed = routableCombinedCallouts(outerFeatureInfos, candidateRadius, { optimizationPass, centerOverride }, profileClock)
          // Classic/lane: standard layout with no violations.
          // Elliptic: labels placed with no HORIZONTAL overflow and no leader crossing the ring
          // (strictInvalid captures both). Vertical overflow is fine — the oval extends up/down and
          // the SVG scrolls — so we do NOT gate on viewport height. This lets the ring stay large.
          let feasible =
            !routed.violations.length && routed.mode === 'standard' && !routed.packedUsed && !routed.strictInvalid
          if (isElliptic) {
            feasible =
              !routed.strictInvalid &&
              !routed.packedUsed &&
              routed.callouts.length > 0 &&
              (!jointlyOptimizeArcs || routed.routingQuality?.fitsViewport === true)
          }
          const result = {
            feasible,
            outerFeatureInfos,
            routed,
          }
          if (routerDebugEnabled && jointlyOptimizeArcs && !options.skipSideEffects) {
            console.info('[router][radius-candidate]', JSON.stringify({
              viewport: [viewportWidth, viewportHeight], radius: candidateRadius, pass: optimizationPass,
              quality: routed.routingQuality, strictInvalid: routed.strictInvalid,
              placementFailure: routed.placementFailure,
              nonBoundsGeometryViolation: routed.nonBoundsGeometryViolation,
              violations: routed.violations, count: routed.callouts.length,
              expected: routed.baseSiteCount + routed.candidates.length,
            }))
          }
          evaluated.set(evaluationKey, result)
          if (routerProfileEnabled) {
            profile.push({
              step,
              ms: elapsedMs(profileClock, started),
              details: `r=${candidateRadius} pass=${optimizationPass} feasible=${result.feasible ? 1 : 0} outer=${outerFeatureInfos.length} hardMin=${hardMinRadius} searchMin=${searchMinRadius} softTarget=${softTargetRadius} softFloor=${softFloorRadius ?? 'off'} algo=${circularRouterAlgorithm}`,
            })
          }
          return result
        }

        function evaluatePacked(candidateRadius: number, step: string) {
          const started = profileClock ? profileClock.now() : 0
          const { outerFeatureInfos } = featureCalloutPlanAtRadius(candidateRadius)
          // Elliptic owns oval packing; never swap it for the radial packed columns (those look like
          // variable-length radial leaders with stacked/overlapping text).
          const usePackedColumns = circularRouterAlgorithm !== 'elliptic'
          const routed = routableCombinedCallouts(outerFeatureInfos, candidateRadius, {
            packedFallback: usePackedColumns,
          }, profileClock)
          const result = {
            feasible: false,
            outerFeatureInfos,
            routed: {
              ...routed,
              packedUsed: usePackedColumns,
              mode: (usePackedColumns ? 'packedFallback' : 'standard') as MapLayoutMode,
              violations: [],
              strictInvalid: true,
            },
          }
          if (routerProfileEnabled) {
            profile.push({
              step,
              ms: elapsedMs(profileClock, started),
              details: `r=${candidateRadius} packed=${usePackedColumns ? 1 : 0} algo=${circularRouterAlgorithm} outer=${outerFeatureInfos.length} labels=${routed.callouts.length}`,
            })
          }
          return result
        }

        function snapRadius(value: number) {
          return Math.max(hardMinRadius, Math.min(maxRadius, Math.round(value / 12) * 12))
        }

        // Overflow compact selection must not fall into the costly sub-70% band
        // (VSV: r=140 is ~30% slower than r=168). Caller-derived; not a selector default.
        const overflowCompactRadiusFloorRatio = 0.7
        function overflowMinimumRadius(probes: number[]) {
          return Math.max(...probes) * overflowCompactRadiusFloorRatio
        }

        function rankedArcRadiusCandidate(
          evalResult: ReturnType<typeof evaluate>,
          candidateRadius: number,
        ) {
          return {
            radius: candidateRadius,
            overflowMode: evalResult.routed.overflowMode,
            strictInvalid: evalResult.routed.strictInvalid,
            routingQuality: evalResult.routed.routingQuality,
          }
        }

        /**
         * Elliptic fallback: probes run largest → smallest, so the first radius with no strict
         * failure (horizontal fit + clean leaders) still wins. If none is clean, pick globally
         * among the already-evaluated overflow probes instead of defaulting to max.
         */
        function bestEllipticFit(probes: number[], step: string) {
          const ranked: Array<
            ReturnType<typeof rankedArcRadiusCandidate> & { evalResult: ReturnType<typeof evaluate> }
          > = []
          for (const candidateRadius of probes) {
            const evalResult = evaluate(candidateRadius, step)
            ranked.push({
              ...rankedArcRadiusCandidate(evalResult, candidateRadius),
              evalResult,
            })
            if (!evalResult.routed.strictInvalid && evalResult.routed.callouts.length > 0) {
              return { evalResult, radius: candidateRadius }
            }
          }
          const best = selectPreferredCircularArcRadius(ranked, {
            preferredRadius: ellipticSearchLow,
            minimumOverflowRadius: overflowMinimumRadius(probes),
          })
          return {
            evalResult: best?.evalResult ?? null,
            radius: best?.radius ?? snapRadius(maxRadius),
          }
        }

        let resolvedRadius = hardMinRadius
        let resolvedEval: ReturnType<typeof evaluate> | null = null

        if (jointlyOptimizeArcs) {
          const jointProbes = buildRadiusProbeLadder(
            ellipticSearchLow,
            snapRadius(maxRadius),
            24,
            4,
          )
          const jointRanked: Array<
            ReturnType<typeof rankedArcRadiusCandidate> & { evalResult: ReturnType<typeof evaluate> }
          > = []
          for (const candidateRadius of jointProbes) {
            const evalResult = evaluate(candidateRadius, 'radius.arcJointCandidate')
            jointRanked.push({
              ...rankedArcRadiusCandidate(evalResult, candidateRadius),
              evalResult,
            })
          }
          const bestArc = selectPreferredCircularArcRadius(jointRanked, {
            preferredRadius: ellipticSearchLow,
            minimumOverflowRadius: overflowMinimumRadius(jointProbes),
          })
          if (bestArc) {
            resolvedEval = bestArc.evalResult
            resolvedRadius = bestArc.radius
          }
        }

        // Warm hints share the full radius key; a hint from different labels/router settings is unsafe.
        const warmKey = radiusCacheKey
        const warmHintRadius = readWarmRadius(warmKey)

        const persistedStandardFeasible = options.skipPersistedCache
          ? null
          : readPersistedStandardFeasible(radiusCacheKey)
        if (persistedStandardFeasible === false) {
          // Negative cache is a hint, not a final answer: re-check the useful band
          // (max + searchMin) before giving up on standard layout.
          const maxR = snapRadius(maxRadius)
          const maxEval = evaluate(maxR, 'radius.revalidateMax')
          if (maxEval.feasible) {
            resolvedEval = maxEval
            resolvedRadius = maxR
          } else {
            const searchR = snapRadius(searchMinRadius)
            if (searchR !== maxR) {
              const searchEval = evaluate(searchR, 'radius.revalidateSearchMin')
              if (searchEval.feasible) {
                resolvedEval = searchEval
                resolvedRadius = searchR
              }
            }
          }
          if (!resolvedEval) {
            if (isElliptic) {
              // Elliptic: do not pin max radius — shrinking is what creates viewport room.
              const probes = buildRadiusProbeLadder(ellipticSearchLow, maxR, 12, 10)
              const fitted = bestEllipticFit(probes, 'radius.ellipticRevalidateFit')
              resolvedEval = fitted.evalResult
              resolvedRadius = fitted.radius
              if (routerProfileEnabled) {
                profile.push({
                  step: 'radius.ellipticInfeasibleFit',
                  ms: 0,
                  details: `resolved=${resolvedRadius} max=${maxR} hardMin=${hardMinRadius} softFloor=${softFloorRadius ?? 'off'}`,
                })
              }
            } else {
              // Standard still impossible — keep the largest ring; packed labels handle overflow.
              const packedRadius = maxR
              const packedEval = evaluatePacked(packedRadius, 'radius.packedAtMax')
              resolvedEval = packedEval
              resolvedRadius = packedRadius
              if (routerProfileEnabled) {
                profile.push({
                  step: 'radius.standardInfeasibleKeepMax',
                  ms: 0,
                  details: `max=${maxR} searchMin=${snapRadius(searchMinRadius)} packed=${packedEval.routed.packedUsed ? 1 : 0}`,
                })
              }
            }
          } else if (routerProfileEnabled) {
            profile.push({
              step: 'radius.revalidateRecovered',
              ms: 0,
              details: `resolved=${resolvedRadius} (was cached infeasible)`,
            })
          }
        }

        if (!resolvedEval && !options.skipPersistedCache && readPersistedStandardFeasible(radiusCacheKey) === true) {
          const cachedRadius = readPersistedRadius(radiusCacheKey)
          if (cachedRadius !== null) {
            const clampedCachedRadius = snapRadius(cachedRadius)
            const cachedEval = evaluate(clampedCachedRadius, 'radius.cacheHit')
            if (cachedEval.feasible) {
              resolvedRadius = clampedCachedRadius
              resolvedEval = cachedEval
            }
          }
        }

        // Prefer largest feasible radius. Probe a short ladder from max down to searchMin
        // (below searchMin, shrinking mainly compresses ideal-Y without buying column room).
        // The initial elliptic ladder starts at the soft floor (see ellipticSearchLow).
        // Do not clamp the high end to a warm hint — a prior tiny warm radius would otherwise
        // trap the search in the postage-stamp band.
        if (!resolvedEval) {
          const ladderLow = isElliptic ? ellipticSearchLow : searchMinRadius
          const probes = buildRadiusProbeLadder(ladderLow, maxRadius, 12, isElliptic ? 10 : 8)
          if (routerProfileEnabled) {
            profile.push({
              step: 'radius.probeLadder',
              ms: 0,
              details: `probes=${probes.join(',')} max=${maxRadius} ladderLow=${ladderLow} searchMin=${searchMinRadius} hardMin=${hardMinRadius} softFloor=${softFloorRadius ?? 'off'} warmHint=${warmHintRadius ?? 'none'}`,
            })
          }
          for (const candidateRadius of probes) {
            const evalResult = evaluate(candidateRadius, 'radius.ladderStep')
            if (!evalResult.feasible) continue
            resolvedEval = evalResult
            resolvedRadius = candidateRadius
            break
          }
        }

        if (!resolvedEval) {
          if (isElliptic) {
            const probes = buildRadiusProbeLadder(ellipticSearchLow, snapRadius(maxRadius), 12, 10)
            const fitted = bestEllipticFit(probes, 'radius.ellipticFit')
            resolvedEval = fitted.evalResult
            resolvedRadius = fitted.radius
            if (routerProfileEnabled) {
              profile.push({
                step: 'radius.ellipticViewportFit',
                ms: 0,
                details: `resolved=${resolvedRadius} maxRadius=${maxRadius} hardMin=${hardMinRadius} softFloor=${softFloorRadius ?? 'off'}`,
              })
            }
          } else {
            resolvedEval = evaluatePacked(snapRadius(maxRadius), 'radius.packedAtMax')
            resolvedRadius = snapRadius(maxRadius)
            if (routerProfileEnabled) {
              profile.push({
                step: 'radius.standardInfeasible',
                ms: 0,
                details: `maxRadius=${maxRadius} searchMin=${searchMinRadius} reason=no-standard-layout-keep-max-packed`,
              })
            }
          }
        }

        // Grow upward within the band once a feasible radius is found (largest preferred).
        if (!jointlyOptimizeArcs && resolvedEval?.feasible && resolvedRadius < maxRadius) {
          for (const candidateRadius of buildRadiusProbeLadder(resolvedRadius, maxRadius, 12, 6)) {
            if (candidateRadius <= resolvedRadius) continue
            const evalResult = evaluate(candidateRadius, 'radius.growStep')
            if (!evalResult.feasible) continue
            resolvedRadius = candidateRadius
            resolvedEval = evalResult
            break
          }
          const refineStart = Math.min(maxRadius, resolvedRadius + 9)
          for (let candidateRadius = refineStart; candidateRadius > resolvedRadius; candidateRadius -= 3) {
            const evalResult = evaluate(candidateRadius, 'radius.refineStep')
            if (!evalResult.feasible) continue
            resolvedRadius = candidateRadius
            resolvedEval = evalResult
            break
          }
        }

        // Soft floor: prefer a usable ring over a geometrically "valid" postage stamp.
        //
        // Warm/persisted hints and packed fallbacks can resolve below it. Keep an already valid
        // solution if the floor and its alternatives are invalid: this is a preference, not a validity constraint.
        if (softFloorRadius !== null && resolvedRadius < softFloorRadius) {
          const floored = Math.min(maxRadius, Math.max(softFloorRadius, snapRadius(softFloorRadius)))
          let applied = floored
          let floorEval = evaluate(floored, 'radius.softRingFloor')
          if (floorEval.routed.strictInvalid) {
            for (const candidateRadius of buildRadiusProbeLadder(floored, maxRadius, 12, 6)) {
              if (candidateRadius <= floored) continue
              const stepEval = evaluate(candidateRadius, 'radius.softRingFloorClimb')
              if (stepEval.routed.strictInvalid) continue
              floorEval = stepEval
              applied = candidateRadius
              break
            }
          }
          const completeAndValid = (result: ReturnType<typeof evaluate>) =>
            !result.routed.strictInvalid && !result.routed.packedUsed &&
            result.routed.callouts.length === result.routed.baseSiteCount + result.routed.candidates.length
          const keepExisting = Boolean(resolvedEval && completeAndValid(resolvedEval) && !completeAndValid(floorEval))
          if (!keepExisting) {
            resolvedEval = floorEval
            resolvedRadius = applied
          }
          if (routerProfileEnabled) {
            profile.push({
              step: keepExisting ? 'radius.softRingFloorRetainedValid' : floorEval.routed.strictInvalid ? 'radius.softRingFloorFallback' : 'radius.softRingFloorApplied',
              ms: 0,
              details: `floored=${floored} applied=${resolvedRadius} softTarget=${softTargetRadius} maxRadius=${maxRadius} strictInvalid=${floorEval.routed.strictInvalid ? 1 : 0}`,
            })
          }
        }

        if (resolvedEval && jointlyOptimizeArcs) {
          resolvedEval = evaluate(resolvedRadius, 'radius.arcFinal', 'final')
          // Coarse scores can differ materially from the actual finished leaders. When the
          // result is invalid or has a short bend, try a small fixed neighborhood at the
          // final pass and compare complete, returned-center-validated layouts. All growth
          // is measured against this one original final result, so it cannot accumulate.
          if (needsFinalRadiusSearch({
            radius: resolvedRadius,
            valid: !resolvedEval.routed.strictInvalid && !resolvedEval.routed.packedUsed,
            complete: resolvedEval.routed.callouts.length === resolvedEval.routed.baseSiteCount + resolvedEval.routed.candidates.length,
            quality: resolvedEval.routed.routingQuality,
          })) {
            const finalized = [{ radius: resolvedRadius, evalResult: resolvedEval }]
            for (const delta of [-24, -12, 12, 24]) {
              const candidateRadius = resolvedRadius + delta
              if (candidateRadius < ellipticSearchLow || candidateRadius > maxRadius) continue
              finalized.push({ radius: candidateRadius, evalResult: evaluate(candidateRadius, 'radius.arcFinalAlternative', 'final') })
            }
            // If the preferred band produced no complete valid final route, make the soft
            // radius floor a preference. Preserve its feature-track capacity while sampling
            // two smaller radii; feature plans and finished geometry are recomputed at each.
            if (softFloorRadius !== null && !finalized.some(({ evalResult }) =>
              !evalResult.routed.strictInvalid && !evalResult.routed.packedUsed &&
              evalResult.routed.callouts.length === evalResult.routed.baseSiteCount + evalResult.routed.candidates.length,
            )) {
              const floorLevels = mapLayoutHelpers.featureLevelLimitAt(softFloorRadius)
              // Keep the same minimum central clearance used to determine whether a
              // feature track fits, even when the soft floor permits very small rings.
              let lo = Math.ceil(Math.max(hardMinRadius, CIRCULAR_FEATURE_TRACK_START_PX + 52))
              let hi = Math.ceil(softFloorRadius)
              while (lo < hi) {
                const mid = Math.floor((lo + hi) / 2)
                if (mapLayoutHelpers.featureLevelLimitAt(mid) >= floorLevels) hi = mid
                else lo = mid + 1
              }
              for (const candidateRadius of planInvalidRadiusRecovery(lo, softFloorRadius, finalized.map((entry) => entry.radius))) {
                finalized.push({ radius: candidateRadius, evalResult: evaluate(candidateRadius, 'radius.belowSoftFloorRecovery', 'final') })
              }
            }
            const candidates = finalized.map(({ radius, evalResult }) => ({
              radius,
              valid: !evalResult.routed.strictInvalid && !evalResult.routed.packedUsed,
              complete: evalResult.routed.callouts.length === evalResult.routed.baseSiteCount + evalResult.routed.candidates.length,
              quality: evalResult.routed.routingQuality,
              evalResult,
            }))
            const best = selectFinalCircularRadius(candidates)
            if (best) {
              resolvedRadius = best.radius
              resolvedEval = best.evalResult
            }
          }
        }

        // The preferred diameter is not a hard floor. For a crowded small viewport, try a
        // bounded set of smaller final routes, keeping the feature-track capacity of the
        // selected radius. Each trial rebuilds its own feature plan and rendered anchors.
        if (resolvedEval && jointlyOptimizeArcs && resolvedEval.routed.routingQuality &&
          (responsiveMapPolicy.shortSide < 780 || resolvedEval.routed.strictInvalid)) {
          const featureLevels = mapLayoutHelpers.featureLevelLimitAt(resolvedRadius)
          let lower = Math.ceil(Math.max(hardMinRadius, CIRCULAR_FEATURE_TRACK_START_PX + 52))
          let upper = Math.ceil(resolvedRadius)
          while (lower < upper) {
            const middle = Math.floor((lower + upper) / 2)
            if (mapLayoutHelpers.featureLevelLimitAt(middle) >= featureLevels) upper = middle
            else lower = middle + 1
          }
          const probes = planCircularDemandRadiusSearch({
            selectedRadius: resolvedRadius, hardMinRadius, featureReadabilityFloor: lower,
            demand: resolvedEval.routed.routingQuality,
          })
          const candidateFor = (candidateRadius: number, evalResult: ReturnType<typeof evaluate>) => ({
            radius: candidateRadius,
            valid: !evalResult.routed.strictInvalid && !evalResult.routed.packedUsed,
            complete: evalResult.routed.callouts.length === evalResult.routed.baseSiteCount + evalResult.routed.candidates.length,
            quality: evalResult.routed.routingQuality,
            evalResult,
          })
          const trials = [candidateFor(resolvedRadius, resolvedEval)]
          for (const candidateRadius of probes) {
            const candidate = candidateFor(candidateRadius, evaluate(candidateRadius, 'radius.demandFinal', 'final'))
            trials.push(candidate)
            if (candidate.valid && candidate.complete && !needsFinalRadiusSearch(candidate)) break
          }
          const best = selectFinalCircularRadius(trials)
          if (best) {
            resolvedRadius = best.radius
            resolvedEval = best.evalResult
          }
        }

        // A single finished reroute can use whitespace that the router's small, fixed-envelope
        // center refinement cannot reach. Keep the chosen radius and all label identities, and
        // compare the fully validated, rendered-anchor scores before keeping the candidate.
        if (resolvedEval && jointlyOptimizeArcs && displaySettings.labelRouting.ellipticBalanceRing !== false &&
          titleFitsInsideAtRadius(resolvedRadius) && resolvedEval.feasible &&
          needsFinalRadiusSearch({
            radius: resolvedRadius,
            valid: !resolvedEval.routed.strictInvalid && !resolvedEval.routed.packedUsed,
            complete: resolvedEval.routed.callouts.length === resolvedEval.routed.baseSiteCount + resolvedEval.routed.candidates.length,
            quality: resolvedEval.routed.routingQuality,
          })) {
          const ringX = resolvedEval.routed.ringCenterX ?? centerX
          const ringY = resolvedEval.routed.ringCenterY ?? centerY
          const edge = resolvedRadius + enzymeOuterOffset
          const bounds = resolvedEval.routed.callouts.reduce((b, callout) => ({
            left: Math.min(b.left, callout.box.left, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x),
            right: Math.max(b.right, callout.box.right, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x),
            top: Math.min(b.top, callout.box.top, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y),
            bottom: Math.max(b.bottom, callout.box.bottom, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y),
          }), { left: ringX - edge, right: ringX + edge, top: ringY - edge, bottom: ringY + edge })
          const proposal = proposeCircularWhitespaceCenter({
            center: { x: centerX, y: centerY }, radius: resolvedRadius,
            width: layoutMapWidth, height: layoutMapHeight, bottomReservedPx: 0, bounds,
          })
          if (proposal) {
            const alternative = evaluate(resolvedRadius, 'radius.whitespaceCenter', 'final', proposal)
            const baselineCandidate = {
              radius: resolvedRadius, valid: !resolvedEval.routed.strictInvalid && !resolvedEval.routed.packedUsed,
              complete: resolvedEval.routed.callouts.length === resolvedEval.routed.baseSiteCount + resolvedEval.routed.candidates.length,
              quality: resolvedEval.routed.routingQuality, evalResult: resolvedEval,
            }
            const alternativeCandidate = {
              radius: resolvedRadius, valid: !alternative.routed.strictInvalid && !alternative.routed.packedUsed &&
                alternative.routed.violations.length === 0 && alternative.routed.routingQuality?.fitsViewport === true,
              complete: alternative.routed.callouts.length === baselineCandidate.evalResult.routed.callouts.length &&
                alternative.routed.callouts.length === alternative.routed.baseSiteCount + alternative.routed.candidates.length,
              quality: alternative.routed.routingQuality, evalResult: alternative,
            }
            resolvedEval = selectFinalCircularRadius([baselineCandidate, alternativeCandidate], 0)?.evalResult ?? resolvedEval
          }
        }

        if (routerProfileEnabled) {
          profile.push({
            step: 'radius.total',
            ms: profile.reduce((sum, item) => sum + item.ms, 0),
            details: `resolved=${resolvedRadius} maxRadius=${maxRadius} hardMin=${hardMinRadius} searchMin=${searchMinRadius} softTarget=${softTargetRadius} softFloor=${softFloorRadius ?? 'off'} warmHint=${warmHintRadius ?? 'none'} standard=${resolvedEval?.feasible ? 1 : 0} packed=${resolvedEval?.routed.packedUsed ? 1 : 0}`,
          })
        }
        const standardFeasible = resolvedEval?.feasible ?? false
        return {
          radius: resolvedRadius,
          radiusSearchSnapshot: resolvedEval
            ? { cacheKey: radiusCacheKey, radius: resolvedRadius, outerFeatureInfos: resolvedEval.outerFeatureInfos, routed: resolvedEval.routed }
            : null,
          radiusProfile: profile,
          persistRadius: options.skipSideEffects ? null : { cacheKey: radiusCacheKey, radius: resolvedRadius, standardFeasible },
          warmRadius: options.skipSideEffects ? null : { key: warmKey, radius: resolvedRadius, standardFeasible },
        }
        }, `${record.sequence.length} bp`)
      }

    const solved = resolveCircularMapRadius(null, { skipLayoutCache: false, skipPersistedCache: false, skipSideEffects: false })
    return {
      ...solved,
      profile(clock: RouterClock) {
        return resolveCircularMapRadius(clock, { skipLayoutCache: true, skipPersistedCache: true, skipSideEffects: true })
      },
    }
  }, [centerX, centerY, circularRouterAlgorithm, displaySettings, layoutMapHeight, layoutMapWidth, mapLayoutHelpers, mapSize, minLocked, radiusCacheKey, record.sequence.length, responsiveMapPolicy, routerDebugEnabled, routerProfileEnabled, viewportHeight, viewportWidth])
  const radius = radiusSolve.radius
  const radiusSearchSnapshot = radiusSolve.radiusSearchSnapshot
  const {
    featureRadiusAt,
    featureLabelFitsAtRadius,
    featureLabelArcAtRadius,
    featureNoColorLabelBackdropArc,
    featureLevelLimitAt,
  } = mapLayoutHelpers
  function featureRadius(level: number) {
    return featureRadiusAt(level, radius)
  }
  function featureLabelFits(info: FeatureRenderInfo) {
    return featureLabelFitsAtRadius(info, radius)
  }
  function featureLabelArc(info: FeatureRenderInfo) {
    return featureLabelArcAtRadius(info, featureRadius(info.level), { x: drawCenterX, y: drawCenterY })
  }


  const rulerBandHalfWidth = rulerTrackFeatures.length > 0 ? 10 : 3
  const rulerInnerEdgeOffset = -rulerBandHalfWidth
  const rulerTickLength = 6
  // Sit beside the notch, inward of the ring: middle baseline would otherwise bury half a letter in the ruler.
  const rulerLabelRadius = circularRulerLabelRadius(radius, rulerInnerEdgeOffset, rulerTickLength)
  // Origin mark: start on the outer duplex ring, cross the inner ring, end ~2× a regular tick inward.
  const originNotchLength = 2 * rulerTickLength
  const originNotchOuterOffset = rulerBandHalfWidth

  const layoutBundle = useMemo(() => {
    const {
      calloutLayoutInput,
      runStrictCircularLayout,
      featureCalloutPlanAtRadius,
      routableCombinedCallouts,
      renderedFeaturesAtRadius,
      featureLevelLimitAt,
      rangesOverlap,
    } = mapLayoutHelpers
    const solvedRadius = radiusSearchSnapshot?.radius ?? radiusSolve.radius
      function featureCalloutLayouts(
        profileClock: RouterClock | null = null,
        radiusSearchSnapshot: SolvedCalloutsSnapshot | null = null,
      ) {
        const profileEntries: RouterProfileEntry[] = []
        const planStarted = profileClock ? profileClock.now() : 0
        const { layouts, outerFeatureInfos, preferredLabelSegmentIds, gapLabelConnectors } = featureCalloutPlanAtRadius(solvedRadius)
        const radiusFeatures = renderedFeaturesAtRadius(solvedRadius)
        if (routerProfileEnabled) {
          profileEntries.push({
            step: 'featureCalloutPlanAtRadius',
            ms: elapsedMs(profileClock, planStarted),
            details: `outerFeatureInfos=${outerFeatureInfos.length} renderedFeatures=${radiusFeatures.length}`,
          })
        }

        let enzymeCallouts: ReturnType<typeof layoutEnzymeCallouts>
        let packedModeUsed = false
        let mode: MapLayoutMode = 'standard'
        let snapshotRouted: RoutedCalloutSnapshot | null
        let outerFeaturesComplete = true
        let featureBodyLevels = new Map<string, number>()
        const packedDebugEntries: Array<Record<string, unknown>> = []
        const atMinimumRadius = solvedRadius <= responsiveMapPolicy.hardMinRadius + 0.5
        const solvedSnapshot =
          radiusSearchSnapshot &&
          radiusSearchSnapshot.cacheKey === radiusCacheKey &&
          radiusSearchSnapshot.radius === solvedRadius
            ? radiusSearchSnapshot
            : null
        // Packed is allowed whenever standard cannot place the label set — including at max radius.
        // Elliptic owns its own oval packing; do not replace it with the packed radial fallback.
        const allowPackedFallback =
          circularRouterAlgorithm !== 'elliptic' &&
          (atMinimumRadius || Boolean(solvedSnapshot?.routed.packedUsed) || Boolean(solvedSnapshot?.routed.strictInvalid))
        const canReuseSolvedSnapshot = Boolean(
          solvedSnapshot &&
          !circularRouterCompareEnabled &&
          (!solvedSnapshot.routed.strictInvalid || solvedSnapshot.routed.packedUsed || !allowPackedFallback),
        )

        if (outerFeatureInfos.length) {
          const outerStarted = profileClock ? profileClock.now() : 0
          const bodyOccupancy = new Map<number, Array<{ start: number; end: number }>>()
          radiusFeatures
            .filter((info) => !outerFeatureInfos.some((outerInfo) => outerInfo.segmentId === info.segmentId))
            .forEach((info) => {
              const occupied = bodyOccupancy.get(info.level) ?? []
              occupied.push({ start: info.start, end: info.end })
              bodyOccupancy.set(info.level, occupied)
            })
          const externalLevels = new Map<string, number>()
          const bodyLevelCap = featureLevelLimitAt(solvedRadius)
          outerFeatureInfos
            .toSorted((a, b) => a.start - b.start || b.end - a.end)
            .forEach((info) => {
              let resolvedLevel = 0
              while (
                resolvedLevel <= bodyLevelCap &&
                (bodyOccupancy.get(resolvedLevel) ?? []).some((range) => rangesOverlap(info.start, info.end, range.start, range.end))
              ) {
                resolvedLevel += 1
              }
              // No free ring within the cap — omit rather than stacking onto the last row.
              if (resolvedLevel > bodyLevelCap) return
              const occupied = bodyOccupancy.get(resolvedLevel) ?? []
              occupied.push({ start: info.start, end: info.end })
              bodyOccupancy.set(resolvedLevel, occupied)
              externalLevels.set(info.segmentId, resolvedLevel)
            })
          featureBodyLevels = externalLevels

          const placeableOuterFeatureInfos = outerFeatureInfos.filter((info) => externalLevels.has(info.segmentId))
          outerFeaturesComplete = placeableOuterFeatureInfos.length === outerFeatureInfos.length
          const sameOuterFeatureInfos = Boolean(
            solvedSnapshot &&
            solvedSnapshot.outerFeatureInfos.length === placeableOuterFeatureInfos.length &&
            solvedSnapshot.outerFeatureInfos.every((info, index) => info.segmentId === placeableOuterFeatureInfos[index]?.segmentId),
          )
          const reusedSolvedOuter = Boolean(canReuseSolvedSnapshot && solvedSnapshot && sameOuterFeatureInfos)
          const routed =
            reusedSolvedOuter && solvedSnapshot
              ? solvedSnapshot.routed
              : routableCombinedCallouts(placeableOuterFeatureInfos, solvedRadius, {
                  profileEntries: profileClock ? profileEntries : undefined,
                  packedFallback: allowPackedFallback,
                  knownStrictInvalid: Boolean(sameOuterFeatureInfos && solvedSnapshot?.routed.strictInvalid && !circularRouterCompareEnabled),
                  compare: circularRouterCompareEnabled,
                }, profileClock)
          packedModeUsed = routed.packedUsed
          mode = routed.mode
          snapshotRouted = routed
          const combinedCallouts = routed.callouts
          const splitCallouts = splitCircularFeatureCallouts(combinedCallouts, routed.baseSiteCount, routed.candidates)
          splitCallouts.featureCallouts.forEach(({ info, callout }) => {
            const renderLevel = externalLevels.get(info.segmentId)
            if (renderLevel === undefined) return
            layouts.set(info.segmentId, { kind: 'outer', callout, renderLevel })
          })
          enzymeCallouts = splitCallouts.baseCallouts
          if (routerProfileEnabled) {
            profileEntries.push({
              step: 'featureCalloutLayouts.outerPlacement',
              ms: elapsedMs(profileClock, outerStarted),
              details: `externalPlaced=${splitCallouts.featureCallouts.length}${reusedSolvedOuter ? ' reusedFromRadius=1' : ''}`,
            })
          }
        } else {
          const directStarted = profileClock ? profileClock.now() : 0
          const directInput = calloutLayoutInput(labeledSites, solvedRadius, routerPackedDebugEnabled ? packedDebugEntries : undefined)
          let strictPlacementInvalid: boolean
          if (canReuseSolvedSnapshot && solvedSnapshot) {
            enzymeCallouts = solvedSnapshot.routed.callouts
            packedModeUsed = solvedSnapshot.routed.packedUsed
            mode = solvedSnapshot.routed.mode
            snapshotRouted = solvedSnapshot.routed
          } else {
            const skipStrictRoute = Boolean(solvedSnapshot?.routed.strictInvalid && allowPackedFallback && !circularRouterCompareEnabled)
            const directLayout = skipStrictRoute ? null : runStrictCircularLayout(directInput, { compare: circularRouterCompareEnabled }, profileClock)
            enzymeCallouts = directLayout?.callouts ?? []
            strictPlacementInvalid =
              skipStrictRoute ||
              Boolean(directLayout?.hasPlacementFailure) ||
              (directLayout?.overflowMode
                ? hasNonBoundsLayoutViolations(enzymeCallouts, directInput)
                : collectLayoutViolations(enzymeCallouts, directInput).length > 0)
            if (strictPlacementInvalid && allowPackedFallback) {
              enzymeCallouts = enforceAllOrNoneEnzymeCallouts(
                layoutEnzymeCalloutsPacked(directInput),
                expectedEnzymeSiteCounts(directInput.sites),
              ).callouts
              packedModeUsed = true
              mode = 'packedFallback'
              if (routerProfileEnabled) {
                profileEntries.push({
                  step: 'featureCalloutLayouts.packedFallbackDirect',
                  ms: 0,
                  details: `strictPlacementInvalid=1 packedAtRadius=${Math.round(solvedRadius)} labels=${enzymeCallouts.length}`,
                })
              }
            }
            if (directLayout?.overflowMode) mode = 'arcOverflow'
            snapshotRouted = {
              callouts: enzymeCallouts,
              candidates: [],
              violations: [],
              baseSiteCount: labeledSites.length,
              packedUsed: packedModeUsed,
              strictInvalid: strictPlacementInvalid,
              overflowMode: directLayout?.overflowMode,
              mode,
              ringCenterX: packedModeUsed ? undefined : directLayout?.ringCenter?.x,
              ringCenterY: packedModeUsed ? undefined : directLayout?.ringCenter?.y,
            }
          }
          if (routerProfileEnabled) {
            profileEntries.push({
              step: 'featureCalloutLayouts.directEnzymeLayout',
              ms: elapsedMs(profileClock, directStarted),
              details: `enzymeCallouts=${enzymeCallouts.length} mode=${mode}${canReuseSolvedSnapshot ? ' reusedFromRadius=1' : ''}`,
            })
          }
        }

        if (routerPackedDebugEnabled && mode === 'packedFallback' && packedDebugEntries.length) {
          console.groupCollapsed(`[router][packed-debug] labels=${packedDebugEntries.length} radius=${Math.round(solvedRadius)} mapSize=${mapSize}`)
          console.table(packedDebugEntries)
          console.groupEnd()
        }

        const layoutSolvedCallouts: SolvedCalloutsSnapshot | null = snapshotRouted
          ? {
              cacheKey: radiusCacheKey,
              radius: solvedRadius,
              outerFeatureInfos,
              routed: snapshotRouted,
            }
          : null

        const ringDx = (snapshotRouted?.ringCenterX ?? centerX) - centerX
        const ringDy = (snapshotRouted?.ringCenterY ?? centerY) - centerY
        if (Math.hypot(ringDx, ringDy) > 0.5) {
          layouts.forEach((layout, key) => {
            if (layout.kind === 'inner') {
              layouts.set(key, {
                ...layout,
                anchor: { x: layout.anchor.x + ringDx, y: layout.anchor.y + ringDy },
                labelPoint: { x: layout.labelPoint.x + ringDx, y: layout.labelPoint.y + ringDy },
                labelPath: translateCircularArcPath(layout.labelPath, ringDx, ringDy),
              })
            }
          })
        }

        return {
          featureCallouts: layouts,
          featureBodyLevels,
          preferredLabelSegmentIds,
          gapLabelConnectors,
          enzymeCallouts,
          hasOuterFeatureCallouts: outerFeatureInfos.length > 0,
          packedModeUsed,
          mode,
          routerInvalid: snapshotRouted?.strictInvalid ?? true,
          routerGeometryViolation: snapshotRouted?.nonBoundsGeometryViolation,
          routerComplete: outerFeaturesComplete && Boolean(snapshotRouted &&
            snapshotRouted.callouts.length === snapshotRouted.baseSiteCount + snapshotRouted.candidates.length),
          profileEntries,
          ringCenterX: snapshotRouted?.ringCenterX,
          ringCenterY: snapshotRouted?.ringCenterY,
          solvedCallouts: layoutSolvedCallouts,
        }
      }

    const profile = (clock: RouterClock) => featureCalloutLayouts(clock, radiusSearchSnapshot)

    const viewportKey = buildViewportKey(viewportWidth, viewportHeight, mapSize, minLocked)
    const cacheKey = circularLayoutKey(radiusCacheKey, viewportKey)
    const cachedEntry = circularMapLayoutCache.get(cacheKey)
    const cachedLayout = cachedEntry?.radius === solvedRadius ? cachedEntry.baseLayouts : null
    if (cachedLayout) {
      return { baseLayouts: cachedLayout, cachePayload: null as CircularMapLayoutCacheEntry | null, profile }
    }

    const result = featureCalloutLayouts(null, radiusSearchSnapshot)
    const { solvedCallouts, ...baseLayouts } = result
    const cachePayload: CircularMapLayoutCacheEntry | null = solvedCallouts
      ? {
          radiusCacheKey,
          viewportKey,
          radius: solvedRadius,
          solvedCallouts,
          baseLayouts,
        }
      : null
    return { baseLayouts, cachePayload, profile }
  }, [centerX, centerY, circularRouterAlgorithm, circularRouterCompareEnabled, labeledSites, mapLayoutHelpers, mapSize, minLocked, radiusCacheKey, radiusSearchSnapshot, radiusSolve, routerPackedDebugEnabled, routerProfileEnabled, responsiveMapPolicy.hardMinRadius, viewportHeight, viewportWidth])

  const baseLayouts = useMemo(() => layoutBundle.baseLayouts, [layoutBundle])

  useLayoutEffect(() => {
    const payload = layoutBundle.cachePayload
    if (payload) circularMapLayoutCache.set(circularLayoutKey(payload.radiusCacheKey, payload.viewportKey), payload)
    const persist = radiusSolve.persistRadius
    if (persist) {
      writePersistedRadius(persist.cacheKey, persist.radius, persist.standardFeasible)
      const warm = radiusSolve.warmRadius
      if (warm) writeWarmRadius(warm.key, warm.radius, warm.standardFeasible)
    }
  }, [layoutBundle.cachePayload, radiusSolve.persistRadius, radiusSolve.warmRadius])

  useLayoutEffect(() => {
    if (!routerProfileEnabled && !routerBenchmarkEnabled && !circularRouterCompareEnabled) return
    const clock = routerPerformanceClock()
    if (routerProfileEnabled) {
      const prioritizeStarted = clock.now()
      const selected = selectEnzymeSitesAllOrNone(restrictionSites, resolvedEnzymeLabelBudget, {
        priorityOrder: enzymePreferences.priorityOrder,
      })
      logRouterProfile(`prioritize labels=${selected.length}`, [
        {
          step: 'prioritizedEnzymeSites',
          ms: elapsedMs(clock, prioritizeStarted),
          details: `inputSites=${restrictionSites.length} budget=${resolvedEnzymeLabelBudget} allOrNone=1`,
        },
      ])
    }
    const radiusProfileStarted = clock.now()
    const radiusProfileRun = radiusSolve.profile(clock)
    const radiusProfileMs = elapsedMs(clock, radiusProfileStarted)
    const layoutStarted = clock.now()
    const layoutResult = layoutBundle.profile(clock)
    if (routerBenchmarkEnabled) {
      console.info(
        `[router][js] ${elapsedMs(clock, layoutStarted).toFixed(2)}ms | labels=${layoutResult.enzymeCallouts.length} | mapSize=${mapSize}`,
      )
    }
    if (routerProfileEnabled) {
      // The detailed profile contains nested totals; time the complete passes separately
      // instead of summing those entries for an end-to-end measurement.
      console.info('[router][application-timing]', JSON.stringify({
        viewport: [viewportWidth, viewportHeight], radiusMs: radiusProfileMs,
        finalLayoutMs: elapsedMs(clock, layoutStarted),
      }))
      logRouterProfile(`js mapSize=${mapSize} labels=${layoutResult.enzymeCallouts.length}`, [
        ...radiusProfileRun.radiusProfile,
        ...layoutResult.profileEntries,
        {
          step: 'baseLayouts.total',
          ms: elapsedMs(clock, layoutStarted),
          details: `radius=${Math.round(radius)} outerFeatureCallouts=${layoutResult.hasOuterFeatureCallouts ? 1 : 0}`,
        },
        {
          step: 'baseLayouts.viewport',
          ms: 0,
          details: `viewport=${viewportWidth}x${viewportHeight} mode=${layoutResult.mode}`,
        },
      ])
    }
  }, [circularRouterCompareEnabled, enzymePreferences.priorityOrder, layoutBundle, mapSize, radius, radiusSolve, routerBenchmarkEnabled, routerProfileEnabled, restrictionSites, resolvedEnzymeLabelBudget, viewportHeight, viewportWidth])

  useEffect(() => {
    if (!useWasmRouter || !useWasmRouterRender || baseLayouts.hasOuterFeatureCallouts || !routerClientRef.current) {
      workerBenchmarkKeyRef.current = ''
      return
    }

    const key = `${record.topology}:${mapSize}:${Math.round(radius)}:${labeledSites.length}:${hashString(labeledSites.map((site) => `${site.match}:${site.enzyme.name}:${site.start}:${site.cutTop}`).join('|'))}`
    if (workerBenchmarkKeyRef.current === key) return
    workerBenchmarkKeyRef.current = key

    const { calloutLayoutInput } = mapLayoutHelpers
    let cancelled = false
    function buildWorkerRouterInput(sites: RestrictionSite[], mapRadius: number): RouterInput {
        const input = calloutLayoutInput(sites, mapRadius)
        const posBp = new Uint32Array(sites.length)
        const labelWPx = new Float32Array(sites.length)
        const labelHPx = new Float32Array(sites.length)
        const kind = new Uint8Array(sites.length)
        const sideHint = new Int8Array(sites.length)
        const priority = new Float32Array(sites.length)
        const groupId = new Uint32Array(sites.length)
        const flags = new Uint32Array(sites.length)

        sites.forEach((site, index) => {
          const label = input.labelForSite ? input.labelForSite(site) : site.enzyme.name
          const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : 12
          const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : 6
          const labelWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * 6
          const normalized = site.start / record.sequence.length
          const isPrimer = site.match.startsWith('__primer_callout__')
          const isFeatureCallout = site.match === '__feature_callout__'
          const isEnzymeCallout = !isPrimer && !isFeatureCallout
          const enzymeCount = enzymeCounts[site.enzyme.name] ?? 0
          const isUnique = isEnzymeCallout && enzymeCount === 1

          posBp[index] = site.start
          labelWPx[index] = labelWidth + labelPadding
          labelHPx[index] = textHeight
          kind[index] = isFeatureCallout ? ROUTER_KIND.feature : isPrimer ? ROUTER_KIND.primer : ROUTER_KIND.enzyme
          sideHint[index] = normalized <= 0.5 ? 1 : -1
          priority[index] = isFeatureCallout ? 0.6 : isPrimer ? 0.8 : 1.0 + (site.enzyme.recognition.length >= 6 ? 0.4 : 0) + Math.max(0, 0.2 - enzymeCount * 0.02)
          groupId[index] = isEnzymeCallout ? hashString(site.enzyme.name) : hashString(site.match)
          flags[index] = isUnique ? 1 : 0
        })

        return {
          params: {
            seqLen: record.sequence.length,
            mapSize: layoutMapSize,
            center: Math.round((centerX + centerY) / 2),
            radius: mapRadius,
            rulerContactOuter: 3,
            rulerContactInner: -3,
            featureProtectedRadius: mapRadius + 6,
            maxLabels: sites.length,
          },
          posBp,
          labelWPx,
          labelHPx,
          kind,
          sideHint,
          priority,
          groupId,
          flags,
        }
      }


    const profileClock = routerBenchmarkEnabled || routerProfileEnabled ? routerPerformanceClock() : null
    const buildStarted = profileClock ? profileClock.now() : 0
    const input = buildWorkerRouterInput(labeledSites, radius)
    const buildElapsed = elapsedMs(profileClock, buildStarted)
    const started = profileClock ? profileClock.now() : 0
    void routerClientRef.current.route(input).then((output) => {
      if (cancelled) return
      const convertStarted = profileClock ? profileClock.now() : 0
      const converted = labeledSites.flatMap((site, index) => {
        if (!output.placed[index]) return []
        const anchor = { x: output.anchorX[index] ?? 0, y: output.anchorY[index] ?? 0 }
        const elbow = { x: output.elbowX[index] ?? 0, y: output.elbowY[index] ?? 0 }
        const connectorEnd = { x: output.endX[index] ?? 0, y: output.endY[index] ?? 0 }
        const textAnchor: 'start' | 'end' = connectorEnd.x >= centerX ? 'start' : 'end'
        const segments: Segment[] = [
          [anchor, elbow],
          [elbow, connectorEnd],
        ]
        return [{
          site,
          index,
          anchor,
          elbow,
          connectorEnd,
          x: connectorEnd.x,
          y: connectorEnd.y + 2,
          label: calloutLabelForSite(site, showEnzymePositions),
          textAnchor,
          box: {
            left: output.boxL[index] ?? connectorEnd.x,
            top: output.boxT[index] ?? connectorEnd.y,
            right: output.boxR[index] ?? connectorEnd.x,
            bottom: output.boxB[index] ?? connectorEnd.y,
          },
          segments,
        }]
      })
      if (routerBenchmarkEnabled) {
        const elapsed = elapsedMs(profileClock, started)
        console.info(`[router][worker] ${elapsed.toFixed(2)}ms | labels=${converted.length} | dropped=${output.droppedCount}`)
      }
      if (routerProfileEnabled) {
        const convertElapsed = elapsedMs(profileClock, convertStarted)
        const elapsed = elapsedMs(profileClock, started)
        logRouterProfile(`worker mapSize=${mapSize} labels=${converted.length}`, [
          {
            step: 'worker.buildInput',
            ms: buildElapsed,
            details: `labeledSites=${labeledSites.length}`,
          },
          {
            step: 'worker.route+transfer',
            ms: Math.max(0, elapsed - convertElapsed),
            details: `dropped=${output.droppedCount}`,
          },
          {
            step: 'worker.convertOutput',
            ms: convertElapsed,
          },
          {
            step: 'worker.total',
            ms: elapsed + buildElapsed,
          },
        ])
      }
      if (useWasmRouterRender) {
        setWorkerEnzymeCallouts(converted)
      } else {
        setWorkerEnzymeCallouts(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    baseLayouts.hasOuterFeatureCallouts,
    centerX,
    centerY,
    enzymeCounts,
    labeledSites,
    layoutMapSize,
    mapLayoutHelpers,
    mapSize,
    radius,
    record.sequence.length,
    record.topology,
    routerBenchmarkEnabled,
    routerProfileEnabled,
    showEnzymePositions,
    useWasmRouter,
    useWasmRouterRender,
  ])

  const featureCallouts = baseLayouts.featureCallouts
  const wasmWorkerOverlayAllowed =
    useWasmRouter && useWasmRouterRender && !baseLayouts.hasOuterFeatureCallouts
  if (wasmWorkerOverlayAllowed !== wasmWorkerOverlayAllowedPrev) {
    setWasmWorkerOverlayAllowedPrev(wasmWorkerOverlayAllowed)
    if (!wasmWorkerOverlayAllowed) {
      setWorkerEnzymeCallouts(null)
    }
  }
  const enzymeCallouts =
    wasmWorkerOverlayAllowed && workerEnzymeCallouts
      ? workerEnzymeCallouts
      : baseLayouts.enzymeCallouts
  const ringDrawCenterX = baseLayouts.ringCenterX ?? centerX
  const ringDrawCenterY = baseLayouts.ringCenterY ?? centerY
  drawCenterX = ringDrawCenterX
  drawCenterY = ringDrawCenterY
  const packedModeActive = baseLayouts.packedModeUsed
  const mapLayoutMode = baseLayouts.mode
  useEffect(() => {
    onLayoutModeChange?.(mapLayoutMode)
  }, [mapLayoutMode, onLayoutModeChange])
  const effectiveFeatureLevelLimit = featureLevelLimitAt(radius)
  const mapRenderedFeatures = useMemo(() => {
    const standard = constrainCircularFeatureLevels(
      renderedFeatures,
      effectiveFeatureLevelLimit,
      true,
    )
    const orfs = constrainCircularFeatureLevels(
      orfRenderedFeatures,
      effectiveFeatureLevelLimit,
      false,
    )
    return packedModeActive
      ? [...standard, ...orfs].filter((feature) => featureLevelBand(feature.level) === 0)
      : [...standard, ...orfs]
  }, [effectiveFeatureLevelLimit, orfRenderedFeatures, packedModeActive, renderedFeatures])
  const mapFeatureGapLinks = useMemo(
    () =>
      // Product Vector/Insert highlights: hide exon gap dashes that read like “(in frame with …)” spills.
      rulerTrackFeatures.length > 0
        ? []
        : featureGapConnectors(mapRenderedFeatures.filter((feature) => !sgRnaParts.has(feature.feature.id)), record.sequence.length),
    [mapRenderedFeatures, record.sequence.length, rulerTrackFeatures.length, sgRnaParts],
  )
  // Distance from the ring center to the innermost drawn content. Title placement depends on this
  // (ring size + actual feature rows / inward labels) and never on viewport height, so shrinking
  // the window vertically without changing the ring keeps the name centered.
  const innerContentRadius = (() => {
    let inner = radius
    for (const feature of mapRenderedFeatures) {
      const band = featureLevelBand(feature.level)
      inner = Math.min(inner, featureRadiusAt(band, radius) - CIRCULAR_FEATURE_HALF_WIDTH_PX)
    }
    featureCallouts.forEach((layout) => {
      if (layout.kind !== 'inner') return
      const dx = layout.labelPoint.x - ringDrawCenterX
      const dy = layout.labelPoint.y - ringDrawCenterY
      inner = Math.min(inner, Math.hypot(dx, dy) - featureInlineFontSizePx)
    })
    return inner
  })()
  const titleInsideCircle = circularMapTitleFitsInsideRing({
    innerContentRadius,
    titleWidth: titleTextWidthEstimate,
  })
  const fittedViewBox = (() => {
    let left = ringDrawCenterX - (radius + 3)
    let right = ringDrawCenterX + (radius + 3)
    let top = ringDrawCenterY - (radius + 3)
    let bottom = ringDrawCenterY + (radius + 3)

    enzymeCallouts.forEach((callout) => {
      left = Math.min(left, callout.box.left, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
      right = Math.max(right, callout.box.right, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
      top = Math.min(top, callout.box.top, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
      bottom = Math.max(bottom, callout.box.bottom, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
    })

    featureCallouts.forEach((layout) => {
      if (layout.kind !== 'outer') return
      left = Math.min(left, layout.callout.box.left, layout.callout.anchor.x, layout.callout.elbow.x, layout.callout.connectorEnd.x)
      right = Math.max(right, layout.callout.box.right, layout.callout.anchor.x, layout.callout.elbow.x, layout.callout.connectorEnd.x)
      top = Math.min(top, layout.callout.box.top, layout.callout.anchor.y, layout.callout.elbow.y, layout.callout.connectorEnd.y)
      bottom = Math.max(bottom, layout.callout.box.bottom, layout.callout.anchor.y, layout.callout.elbow.y, layout.callout.connectorEnd.y)
    })

    const padding = CIRCULAR_MAP_CONTENT_PADDING_PX
    left -= padding
    right += padding
    top -= padding
    bottom += padding

    const contentBottom = bottom
    if (!titleInsideCircle) {
      left = Math.min(left, centerX - titleTextWidthEstimate / 2 - padding)
      right = Math.max(right, centerX + titleTextWidthEstimate / 2 + padding)
      bottom += CIRCULAR_MAP_BELOW_TITLE_HEIGHT_PX
    }

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
      contentBottom,
    }
  })()

  // Packed columns always expand to content. Elliptic expands when content exceeds the viewport
  // or shifts beyond a nominal edge; the fitted view remains at least as large as the map canvas.
  const ellipticContentOverflows =
    circularRouterAlgorithm === 'elliptic' &&
    (fittedViewBox.left < -1 ||
      fittedViewBox.top < -1 ||
      fittedViewBox.left + fittedViewBox.width > layoutMapWidth + 1 ||
      fittedViewBox.top + fittedViewBox.height > layoutMapHeight + 1 ||
      fittedViewBox.width > viewportWidth + 1 ||
      fittedViewBox.height > viewportHeight + 1)
  const usePackedContentViewport = mapLayoutMode === 'packedFallback' || ellipticContentOverflows
  const packedView = (() => {
    if (!usePackedContentViewport) {
      return {
        left: 0,
        top: 0,
        width: layoutMapWidth,
        height: layoutMapHeight,
        pixelWidth: layoutMapWidth,
        pixelHeight: layoutMapHeight,
      }
    }
    if (circularRouterAlgorithm === 'elliptic') {
      return fitCircularContentViewport({
        contentLeft: fittedViewBox.left,
        contentTop: fittedViewBox.top,
        contentWidth: fittedViewBox.width,
        contentHeight: fittedViewBox.height,
        layoutWidth: layoutMapWidth,
        layoutHeight: layoutMapHeight,
      })
    }
    return {
      left: fittedViewBox.left,
      top: fittedViewBox.top,
      width: fittedViewBox.width,
      height: fittedViewBox.height,
      pixelWidth: Math.ceil(fittedViewBox.width),
      pixelHeight: Math.ceil(fittedViewBox.height),
    }
  })()
  const svgPixelWidth = packedView.pixelWidth
  const svgPixelHeight = packedView.pixelHeight
  const svgViewBox = `${packedView.left} ${packedView.top} ${packedView.width} ${packedView.height}`
  // This status describes the validated routing snapshot. Manual placements and worker
  // overrides have independent geometry and therefore must not inherit that validation.
  const routerSelectionStatus = manualLabelPoses.size || circularRouterCompareEnabled || (wasmWorkerOverlayAllowed && workerEnzymeCallouts)
    ? 'unverified-override'
    : !baseLayouts.routerComplete
      ? 'incomplete-fallback'
      : baseLayouts.routerInvalid
        ? baseLayouts.routerGeometryViolation === false ? 'placement-fallback' : 'invalid-fallback'
        : ellipticContentOverflows
          ? 'valid-overflow'
          : 'valid-fit'
  useEffect(() => {
    if (!routerDebugEnabled || circularRouterAlgorithm !== 'elliptic') return
    console.info('[router][rendered-selection]', JSON.stringify({
      status: routerSelectionStatus,
      radius,
      center: [ringDrawCenterX, ringDrawCenterY],
      viewport: [viewportWidth, viewportHeight],
      svg: { width: svgPixelWidth, height: svgPixelHeight, viewBox: svgViewBox },
      baseCallouts: enzymeCallouts.length,
      outerFeatures: [...featureCallouts.values()].filter((entry) => entry.kind === 'outer').length,
    }))
  }, [routerDebugEnabled, circularRouterAlgorithm, routerSelectionStatus, radius, ringDrawCenterX,
    ringDrawCenterY, viewportWidth, viewportHeight, svgPixelWidth, svgPixelHeight, svgViewBox,
    enzymeCallouts, featureCallouts])

  useCircularOverflowScroll(mapSvgRef, {
    enabled: mapLayoutMode === 'arcOverflow',
    documentIdentity: record.id,
  })

  function clientToSvg(clientX: number, clientY: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect()
    return {
      x: packedView.left + ((clientX - rect.left) / rect.width) * packedView.width,
      y: packedView.top + ((clientY - rect.top) / rect.height) * packedView.height,
    }
  }

  function manualPoseAt(siteStart: number, svgX: number, svgY: number): ManualLabelPose {
    const connectorEnd = { x: svgX, y: svgY }
    const textAnchor: 'start' | 'end' = connectorEnd.x >= ringDrawCenterX ? 'start' : 'end'
    const angle = circularMapAngle(siteStart, record.sequence.length, record.topology)
    const dist = Math.hypot(connectorEnd.x - ringDrawCenterX, connectorEnd.y - ringDrawCenterY)
    const stub = Math.min(18.6, Math.max(2, dist - radius - 2))
    const elbow = {
      x: ringDrawCenterX + Math.cos(angle) * (radius + stub),
      y: ringDrawCenterY + Math.sin(angle) * (radius + stub),
    }
    return { connectorEnd, elbow, x: connectorEnd.x, textAnchor }
  }

  function positionFromPointer(svg: SVGSVGElement, clientX: number, clientY: number) {
    const { x: svgX, y: svgY } = clientToSvg(clientX, clientY, svg)
    const angle = Math.atan2(svgY - ringDrawCenterY, svgX - ringDrawCenterX)
    return circularMapPositionFromAngle(angle, record.sequence.length, record.topology)
  }

  const rulerSelectBandPath = circularMapRulerSelectBandPath(
    ringDrawCenterX,
    ringDrawCenterY,
    radius,
    rulerBandHalfWidth,
    rulerTickLength,
    record.topology,
  )

  const leaderAngleStats = (() => {
    const leaders = enzymeCallouts.map((callout) => {
      const poseKey = `${callout.site.enzyme.name}::${callout.site.start}::${callout.index}`
      const override = manualLabelPoses.get(poseKey)
      const primerMeta = primerCalloutMeta.get(siteKey(callout.site))
      const sgRnaMeta = sgRnaCalloutMeta.get(siteKey(callout.site))
      const anchor = primerMeta
        ? circularMapPolarPoint(
            primerMeta.anneal5Prime,
            record.sequence.length,
            ringDrawCenterX,
            ringDrawCenterY,
            primerMeta.strand === 'forward'
              ? radius + PRIMER_RULER_OFFSET_PX
              : radius - PRIMER_RULER_OFFSET_PX,
            0,
            record.topology,
          )
        : sgRnaMeta
          ? sgRnaCircularLeaderAnchor(
              sgRnaMeta,
              record.sequence.length,
              ringDrawCenterX,
              ringDrawCenterY,
              radius,
              record.topology,
            )
          : callout.anchor
      return override
        ? { anchor, elbow: override.elbow, connectorEnd: override.connectorEnd }
        : { anchor, elbow: callout.elbow, connectorEnd: callout.connectorEnd }
    })
    featureCallouts.forEach((layout) => {
      if (layout.kind === 'outer') leaders.push(layout.callout)
    })
    return summarizeLeaderBendAngles(leaders)
  })()
  const leaderAngleStatsKey = leaderAngleStats
    ? `${leaderAngleStats.count}|${leaderAngleStats.min}|${leaderAngleStats.mean}|${leaderAngleStats.max}`
    : ''
  const [publishedLeaderAngleStats, setPublishedLeaderAngleStats] = useState(leaderAngleStats)
  const [publishedLeaderAngleStatsKey, setPublishedLeaderAngleStatsKey] = useState(leaderAngleStatsKey)
  if (publishedLeaderAngleStatsKey !== leaderAngleStatsKey) {
    setPublishedLeaderAngleStatsKey(leaderAngleStatsKey)
    setPublishedLeaderAngleStats(leaderAngleStats)
  }

  useEffect(() => {
    onLeaderAngleStatsChange?.(publishedLeaderAngleStats)
  }, [onLeaderAngleStatsChange, publishedLeaderAngleStats])

  return (
    <svg
      ref={mapSvgRef}
      className={`plasmid-map is-min-locked${manualLabelPlacement ? ' is-manual-label-place' : ''}`}
      width={svgPixelWidth}
      height={svgPixelHeight}
      viewBox={svgViewBox}
      data-router-selection-status={routerSelectionStatus}
      data-map-expected-enzyme-sites={routerDebugEnabled ? JSON.stringify(enzymeCalloutSites.map(siteKey)) : undefined}
      data-map-expected-primer-ids={routerDebugEnabled ? JSON.stringify([...primerCalloutMeta.values()].map((meta) => meta.primerId)) : undefined}
      data-map-expected-feature-ids={routerDebugEnabled ? JSON.stringify([...new Set(mapRenderedFeatures.map((info) => info.feature.id))]) : undefined}
      role="img"
      aria-label={`${record.name} circular plasmid map`}
      onPointerMove={(event) => {
        if (draggingLabelKey) {
          event.preventDefault()
          const svg = event.currentTarget
          const { x, y } = clientToSvg(event.clientX, event.clientY, svg)
          const siteStart = Number(draggingLabelKey.split('::')[1] ?? 0)
          const pose = manualPoseAt(siteStart, x, y)
          setManualLabelPoses((current) => {
            const next = new Map(current)
            next.set(draggingLabelKey, pose)
            return next
          })
        }
      }}
      onPointerUp={(event) => {
        if (draggingLabelKey) {
          setDraggingLabelKey(null)
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            // ignore
          }
        }
      }}
      onPointerCancel={() => {
        setDraggingLabelKey(null)
        setDragStart(null)
        setDragEnd(null)
      }}
    >
      {enzymeTooltip.portal}
      <g>
      {record.topology === 'circular' ? (
        <>
          <circle cx={ringDrawCenterX} cy={ringDrawCenterY} r={radius + 3} className="map-backbone outer" />
          <circle cx={ringDrawCenterX} cy={ringDrawCenterY} r={radius - 3} className="map-backbone inner" />
        </>
      ) : (
        (() => {
          const startAngle = circularMapStartAngle('linear')
          const sweep = circularMapSweepRadians('linear')
          const endAngle = startAngle + sweep
          const largeArc = sweep > Math.PI ? 1 : 0
          function horseshoeArc(r: number) {
            const sx = ringDrawCenterX + Math.cos(startAngle) * r
            const sy = ringDrawCenterY + Math.sin(startAngle) * r
            const ex = ringDrawCenterX + Math.cos(endAngle) * r
            const ey = ringDrawCenterY + Math.sin(endAngle) * r
            return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`
          }
          const outerR = radius + 3
          const innerR = radius - 3
          const outerStart = {
            x: ringDrawCenterX + Math.cos(startAngle) * outerR,
            y: ringDrawCenterY + Math.sin(startAngle) * outerR,
          }
          const outerEnd = {
            x: ringDrawCenterX + Math.cos(endAngle) * outerR,
            y: ringDrawCenterY + Math.sin(endAngle) * outerR,
          }
          const innerStart = {
            x: ringDrawCenterX + Math.cos(startAngle) * innerR,
            y: ringDrawCenterY + Math.sin(startAngle) * innerR,
          }
          const innerEnd = {
            x: ringDrawCenterX + Math.cos(endAngle) * innerR,
            y: ringDrawCenterY + Math.sin(endAngle) * innerR,
          }
          return (
            <>
              <path d={horseshoeArc(outerR)} className="map-backbone outer" />
              <path d={horseshoeArc(innerR)} className="map-backbone inner" />
              <line x1={outerStart.x} y1={outerStart.y} x2={innerStart.x} y2={innerStart.y} className="map-backbone" />
              <line x1={outerEnd.x} y1={outerEnd.y} x2={innerEnd.x} y2={innerEnd.y} className="map-backbone" />
            </>
          )
        })()
      )}
      {liveRange && <path d={record.topology === 'circular' && liveRange.start === 0 && liveRange.end === record.sequence.length
        ? `${arcForRange(0, record.sequence.length / 2, selectionOffset)} ${arcForRange(record.sequence.length / 2, record.sequence.length, selectionOffset)}`
        : arcForRange(liveRange.start, liveRange.end, selectionOffset)} className="map-selection" />}
      {liveRange && (
        <g className="clock-selection-markers">
          {(selectionCutStrandPair
            ? [...new Set([
                selectionCutStrandPair.forward.start,
                selectionCutStrandPair.reverse.start,
                selectionCutStrandPair.forward.end,
                selectionCutStrandPair.reverse.end,
              ])]
            : [liveRange.start, liveRange.end]
          ).map((position, index) => clockHand(position, `clock-hand ${index === 0 ? 'start' : index === 1 ? 'end' : 'staggered'}`))}
        </g>
      )}
      {(() => {
        const origin = point(0, originNotchOuterOffset)
        const originInward = point(0, originNotchOuterOffset - originNotchLength)
        return <line x1={origin.x} y1={origin.y} x2={originInward.x} y2={originInward.y} className="map-tick map-tick-origin" />
      })()}
      {rulerMarks.map((position) => {
        const innerEdge = point(position, rulerInnerEdgeOffset)
        const tickEnd = point(position, rulerInnerEdgeOffset - rulerTickLength)
        return <line key={position} x1={innerEdge.x} y1={innerEdge.y} x2={tickEnd.x} y2={tickEnd.y} className="map-tick" />
      })}
      <path
        className="map-select-target"
        d={rulerSelectBandPath}
        fillRule="evenodd"
        aria-label="Drag on the ruler to select sequence positions"
        onPointerDown={(event) => {
          if (manualLabelPlacement || draggingLabelKey) return
          const svg = event.currentTarget.ownerSVGElement
          if (!svg) return
          event.preventDefault()
          event.stopPropagation()
          const position = positionFromPointer(svg, event.clientX, event.clientY)
          if ((event.shiftKey || event.ctrlKey || event.metaKey) && onExtendToBase) {
            // Circular map returns nearest base index; extend to the seam after that base.
            onExtendToBase(Math.min(record.sequence.length, position + 1))
            return
          }
          setDragStart(position)
          setDragEnd(position)
          onRangeSelect({ start: position, end: Math.min(record.sequence.length, position + 1) })
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (dragStart === null) return
          const svg = event.currentTarget.ownerSVGElement
          if (!svg) return
          event.preventDefault()
          const position = positionFromPointer(svg, event.clientX, event.clientY)
          setDragEnd(position)
          selectFromDrag(dragStart, position)
        }}
        onPointerUp={(event) => {
          const svg = event.currentTarget.ownerSVGElement
          if (!svg) return
          event.preventDefault()
          const start = dragStart
          const end = positionFromPointer(svg, event.clientX, event.clientY)
          setDragStart(null)
          setDragEnd(null)
          if (start === null) return
          selectFromDrag(start, end)
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            // ignore
          }
        }}
        onPointerCancel={() => {
          setDragStart(null)
          setDragEnd(null)
        }}
      />
      {mapRenderedFeatures.map((info, index) => {
        const isSelected = selectedFeatureIds.includes(info.feature.id) || info.feature.id === selectedFeatureId
        const isOrf = isOrfFeature(info.feature)
        const labelPathId = `${svgIdScope}-feature-label-${index}`
        const calloutPathId = `${svgIdScope}-feature-callout-label-${index}`
        const innerLabel = featureCallouts.get(info.segmentId)
        const bodyLevelOverride = baseLayouts.featureBodyLevels.get(info.segmentId)
        const uncappedRenderLevel =
          bodyLevelOverride != null
            ? bodyLevelOverride
            : innerLabel?.kind === 'outer'
              ? innerLabel.renderLevel
              : info.level
        // Outer-label body packing can push a feature inward; never crush onto a deeper row.
        if (featureLevelBand(uncappedRenderLevel) > effectiveFeatureLevelLimit) return null
        const renderInfo =
          uncappedRenderLevel === info.level ? info : { ...info, level: uncappedRenderLevel }
        const useArcLabel = featureLabelFits(renderInfo)
        const renderArrow = featureDrawableArrow(renderInfo)
        const labelColor = contrastTextColor(info.feature.color)
        const orfGlow = orfGlowColor(info.feature)
        const orfCore = orfCoreColor(info.feature)
        return (
          <g
            key={info.segmentId}
            data-map-feature-id={info.feature.id}
            data-map-feature-segment={info.segmentId}
            className={`${isSelected ? 'selected-map-feature' : ''}${isSelected && selectedFeatureIds.length >= 3 ? ' is-multi-feature-selection' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(info.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, info.start)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              if (!isOrf) onFeatureEdit(info.feature.id)
            }}
            onContextMenu={isOrf && onFeatureOpenAsProtein ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              onSelect(info.feature.id, false, info.start)
              onFeatureOpenAsProtein(info.feature.id)
            } : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {isOrf ? (
              <>
                {isSelected && selectedFeatureIds.length < 3 && <path d={featureBodyArc(renderInfo, renderArrow)} className="map-feature-orf-halo" />}
                <path d={featureBodyArc(renderInfo, renderArrow)} stroke={orfGlow} className={`map-feature-orf-glow ${renderArrow === 'reverse' ? 'reverse' : ''}`} />
                <path d={featureBodyArc(renderInfo, renderArrow)} stroke={orfCore} className={`map-feature-orf-core ${renderArrow === 'reverse' ? 'reverse' : ''}`} />
                {(renderArrow === 'forward' || renderArrow === 'both') && <polygon points={featureArrow(renderInfo, 4, 0, 2, 'forward')} fill={orfCore} className="map-feature-orf-arrow" />}
                {(renderArrow === 'reverse' || renderArrow === 'both') && <polygon points={featureArrow(renderInfo, 4, 0, 2, 'reverse')} fill={orfCore} className="map-feature-orf-arrow" />}
                {(renderArrow === 'forward' || renderArrow === 'both') && <path d={featureArrowOutline(renderInfo, 4, 0, 2, 'forward')} className="map-feature-orf-arrow-outline" />}
                {(renderArrow === 'reverse' || renderArrow === 'both') && <path d={featureArrowOutline(renderInfo, 4, 0, 2, 'reverse')} className="map-feature-orf-arrow-outline" />}
              </>
            ) : (
              <>
                {isSelected && selectedFeatureIds.length < 3 && !isFeatureNoColor(renderInfo.feature.color) && <path d={featureBandPath(renderInfo, 11.75, renderArrow)} className="selected-feature-halo" />}
                {isFeatureNoColor(renderInfo.feature.color) ? (
                  (() => {
                    const halfWidth = 7.75
                    const trackRadius = featureRadius(renderInfo.level)
                    const startOuter = point(renderInfo.start, halfWidth, trackRadius)
                    const startInner = point(renderInfo.start, -halfWidth, trackRadius)
                    const endOuter = point(renderInfo.end, halfWidth, trackRadius)
                    const endInner = point(renderInfo.end, -halfWidth, trackRadius)
                    const stripeThickness = featureNoColorStripeThickness(halfWidth * 2)
                    return (
                      <g className={`feature-nocolor${isSelected ? ' is-selected' : ''}`}>
                        <path
                          d={featureBandPath(renderInfo, halfWidth, renderArrow)}
                          className="feature-nocolor-hit"
                        />
                        <line
                          x1={startOuter.x}
                          y1={startOuter.y}
                          x2={startInner.x}
                          y2={startInner.y}
                          className="feature-nocolor-cap"
                        />
                        <line
                          x1={endOuter.x}
                          y1={endOuter.y}
                          x2={endInner.x}
                          y2={endInner.y}
                          className="feature-nocolor-cap"
                        />
                        <path
                          d={arcForRange(renderInfo.start, renderInfo.end, 0, trackRadius)}
                          className="feature-nocolor-stripe-arc"
                          style={{ strokeWidth: stripeThickness }}
                        />
                      </g>
                    )
                  })()
                ) : (
                  <path
                    d={featureBandPath(renderInfo, 7.75, renderArrow)}
                    style={{ fill: renderInfo.feature.color }}
                    className="map-feature-shape"
                  />
                )}
                {cleavageArrowsOnSegment(renderInfo.feature, renderInfo.start, renderInfo.end).map((cleavagePos) => {
                  const trackRadius = featureRadius(renderInfo.level)
                  // Draw on the base boundary (same as caret), not the base center.
                  const center = point(cleavagePos, 0, trackRadius)
                  const angleDeg =
                    (circularMapAngle(cleavagePos, record.sequence.length, record.topology) * 180) / Math.PI
                  return (
                    <CleavageArrowMark
                      key={`${renderInfo.segmentId}-cleavage-${cleavagePos}`}
                      transform={`translate(${center.x} ${center.y}) rotate(${angleDeg + 90})`}
                      title={`Cleavage site ${cleavagePos + 1}`}
                    />
                  )
                })}
              </>
            )}
            {displaySettings.features.labelsVisible && !isOrf && useArcLabel && baseLayouts.preferredLabelSegmentIds.has(info.segmentId) ? (
              <>
                {isFeatureNoColor(info.feature.color) && (
                  <path
                    d={featureNoColorLabelBackdropArc(
                      renderInfo,
                      featureRadius(renderInfo.level),
                      estimateLinearInlineFeatureTextWidthPx(featureDisplayName(info.feature), featureInlineFontSizePx) + 6,
                      { x: drawCenterX, y: drawCenterY },
                    )}
                    className="feature-nocolor-label-backdrop-arc"
                    style={{ strokeWidth: featureInlineFontSizePx + 2 }}
                  />
                )}
                <path id={labelPathId} d={featureLabelArc(renderInfo)} className="feature-label-path" />
                <text
                  className={`map-label map-label-arc map-label-in-body${isFeatureNoColor(info.feature.color) ? ' map-label-nocolor' : ''}`}
                  dominantBaseline="central"
                  style={{ fill: labelColor, fontSize: featureInlineFontSizePx, fontWeight: featureInlineFontWeight }}
                >
                  <textPath
                    className={isFeatureNoColor(info.feature.color) ? 'map-label-nocolor' : undefined}
                    href={`#${labelPathId}`}
                    startOffset="50%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={labelColor}
                  >
                    {featureDisplayName(info.feature)}
                  </textPath>
                </text>
              </>
            ) : !isOrf && innerLabel?.kind === 'inner' && baseLayouts.preferredLabelSegmentIds.has(info.segmentId) ? (
              <g className="feature-callout">
                {innerLabel.withLine && <line x1={innerLabel.anchor.x} y1={innerLabel.anchor.y} x2={innerLabel.labelPoint.x} y2={innerLabel.labelPoint.y} />}
                {isFeatureNoColor(info.feature.color) && (
                  <path
                    d={innerLabel.labelPath}
                    className="feature-nocolor-label-backdrop-arc"
                    style={{ strokeWidth: featureInlineFontSizePx + 2 }}
                  />
                )}
                <path id={calloutPathId} d={innerLabel.labelPath} className="feature-label-path" />
                <text
                  className="map-label map-label-arc map-label-inner-lumen"
                  dominantBaseline="central"
                  style={{ fill: 'var(--vg-map-ink)', fontSize: featureInlineFontSizePx, fontWeight: featureInlineFontWeight }}
                >
                  <textPath
                    href={`#${calloutPathId}`}
                    startOffset="50%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--vg-scientific-label-ink)"
                  >
                    {featureDisplayName(info.feature)}
                  </textPath>
                </text>
              </g>
            ) : !isOrf && allowOuterFeatureLabels && innerLabel?.kind === 'outer' && baseLayouts.preferredLabelSegmentIds.has(info.segmentId) ? (
              <g className="feature-callout feature-callout-external">
                <polyline
                  points={`${innerLabel.callout.anchor.x},${innerLabel.callout.anchor.y} ${innerLabel.callout.elbow.x},${innerLabel.callout.elbow.y} ${innerLabel.callout.connectorEnd.x},${innerLabel.callout.connectorEnd.y}`}
                />
                <rect
                  x={innerLabel.callout.box.left}
                  y={innerLabel.callout.box.top}
                  width={innerLabel.callout.box.right - innerLabel.callout.box.left}
                  height={innerLabel.callout.box.bottom - innerLabel.callout.box.top}
                  rx="6"
                  ry="6"
                />
                <text
                  x={(innerLabel.callout.box.left + innerLabel.callout.box.right) / 2}
                  y={(innerLabel.callout.box.top + innerLabel.callout.box.bottom) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: outsideLabelFontSizePx + 2, fontWeight: 750 }}
                >
                  {featureDisplayName(info.feature)}
                </text>
              </g>
            ) : null}
          </g>
        )
      })}
      {mapFeatureGapLinks.map((gap, index) => {
        const key = `${gap.featureId}:${gap.start}-${gap.end}`
        const labelFeature = baseLayouts.gapLabelConnectors.get(gap.featureId)
        const carriesLabel = labelFeature?.start === gap.start && labelFeature.end === gap.end && labelFeature.level === gap.level
        const feature = labelFeature ? mapRenderedFeatures.find((info) => info.feature.id === gap.featureId)?.feature : null
        const pathId = `${svgIdScope}-feature-gap-label-${index}`
        const path = arcForRange(gap.start, gap.end, 0, featureRadius(gap.level))
        return (
          <g key={key} className={selectedFeatureIds.length >= 3 && selectedFeatureIds.includes(gap.featureId) ? 'is-multi-feature-selection' : undefined}>
            <path d={path} className="map-feature-gap-connector" />
            {carriesLabel && feature && (
              <>
                <path
                  d={path}
                  className="feature-gap-label-backdrop"
                  style={{ strokeWidth: featureInlineFontSizePx + 4 }}
                />
                <path id={pathId} d={path} className="feature-label-path" />
                <text
                  className={`map-label map-label-arc map-feature-gap-label${isFeatureNoColor(feature.color) ? ' map-label-nocolor' : ''}`}
                  dominantBaseline="central"
                  style={{ fill: contrastTextColor(feature.color), fontSize: featureInlineFontSizePx, fontWeight: featureInlineFontWeight }}
                >
                  <textPath
                    className={isFeatureNoColor(feature.color) ? 'map-label-nocolor' : undefined}
                    href={`#${pathId}`}
                    startOffset="50%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={contrastTextColor(feature.color)}
                  >
                    {featureDisplayName(feature)}
                  </textPath>
                </text>
              </>
            )}
          </g>
        )
      })}

      {[...primerCalloutMeta.entries()].map(([key, meta]) => {
        const primerRingRadius = meta.strand === 'forward' ? radius + PRIMER_RULER_OFFSET_PX : radius - PRIMER_RULER_OFFSET_PX
        const selected = primerIsSelectedOnMap(meta.primerId, selectedPrimerId, selectedPrimerIds)
        const accent = primerMapAccentColor(meta.color, selected)
        return (
          <path
            key={`primer-annealed-${key}`}
            d={arcForRange(meta.start, meta.end, 0, primerRingRadius)}
            className={`primer-callout-annealed${selected ? ' is-selected' : ''}${!selected && contrastTextColor(meta.color) === '#fff' ? ' primer-dark-color-leader' : ''}`}
            style={{
              stroke: accent,
              '--primer-dark-contrast-color': darkThemePrimerColor(meta.color),
            } as CSSProperties}
          />
        )
      })}

      {sgRnaMapDisplaySegments(
        sgRnaMapSegments,
        (radius * circularMapSweepRadians(record.topology)) / Math.max(1, record.sequence.length),
        record.topology === 'linear' ? { minPosition: 0, maxPosition: record.sequence.length } : undefined,
      ).map((segment, index) => {
        const guideId = segment.annotation.guide.id
        const selected = selectedFeatureId === guideId || selectedFeatureIds.includes(guideId)
        const ringRadius = sgRnaCircularBindingRadius(radius, segment.strand)
        const arrow = segment.part === 'pam'
          ? sgRnaMapPamArrowSpan(segment, (ringRadius * circularMapSweepRadians(record.topology)) / Math.max(1, record.sequence.length))
          : null
        const arrowPoints = arrow
          ? [
              point(arrow.tipBp, 0, ringRadius),
              point(arrow.baseBp, SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX, ringRadius),
              point(arrow.baseBp, -SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX, ringRadius),
            ].map(({ x, y }) => `${x},${y}`).join(' ')
          : null
        return <g
          key={`sgrna-map-${segment.annotation.id}-${segment.part}-${index}`}
          data-map-guide-id={guideId}
          className={`sgrna-map-callout${selected ? ' is-selected' : ''}${selected && selectedFeatureIds.length >= 3 ? ' is-multi-feature-selection' : ''}`}
          onClick={(event) => { event.stopPropagation(); onSelect(guideId, event.shiftKey || event.ctrlKey || event.metaKey) }}
          onDoubleClick={(event) => { event.stopPropagation(); onFeatureEdit(guideId) }}
        >
          {arrowPoints
            ? <polygon points={arrowPoints} className="sgrna-map-pam-arrow" />
            : <path d={arcForRange(segment.start, segment.end, 0, ringRadius)} className="sgrna-map-binding" />}
          <title>{`${segment.annotation.guide.name} ${segment.part === 'pam' ? `PAM ${segment.annotation.observedPam}` : 'guide'} · ${segment.annotation.nuclease}`}</title>
        </g>
      })}

      {enzymeCallouts.map((callout) => {
        const { site, index, anchor, label } = callout
        const poseKey = `${site.enzyme.name}::${site.start}::${index}`
        const override = manualLabelPoses.get(poseKey)
        const elbow = override?.elbow ?? callout.elbow
        const connectorEnd = override?.connectorEnd ?? callout.connectorEnd
        const x = override?.x ?? callout.x
        const textAnchor = override?.textAnchor ?? callout.textAnchor
        const primerMeta = primerCalloutMeta.get(siteKey(site))
        const sgRnaMeta = sgRnaCalloutMeta.get(siteKey(site))
        const renderedLabelX = mapCalloutTextOriginX(
          x,
          textAnchor,
          primerMeta || !sgRnaMeta ? outsideLabelLeaderGapPx : 0,
        )

        function beginManualDrag(event: ReactPointerEvent<SVGGElement>) {
          if (!manualLabelPlacement) return false
          event.stopPropagation()
          event.preventDefault()
          const svg = event.currentTarget.ownerSVGElement
          if (!svg) return true
          svg.setPointerCapture(event.pointerId)
          setDraggingLabelKey(poseKey)
          const { x: svgX, y: svgY } = clientToSvg(event.clientX, event.clientY, svg)
          const pose = manualPoseAt(site.start, svgX, svgY)
          setManualLabelPoses((current) => {
            const next = new Map(current)
            next.set(poseKey, pose)
            return next
          })
          return true
        }

        if (sgRnaMeta) {
          const guideId = sgRnaMeta.guide.id
          const selected = selectedFeatureId === guideId || selectedFeatureIds.includes(guideId)
          const anchor = sgRnaCircularLeaderAnchor(
            sgRnaMeta,
            record.sequence.length,
            ringDrawCenterX,
            ringDrawCenterY,
            radius,
            record.topology,
          )
          return <g
            key={poseKey}
            data-map-guide-id={guideId}
            className={`enzyme-callout sgrna-map-callout${selected ? ' is-selected' : ''}${selected && selectedFeatureIds.length >= 3 ? ' is-multi-feature-selection' : ''}`}
            onClick={(event) => { event.stopPropagation(); onSelect(guideId, event.shiftKey || event.ctrlKey || event.metaKey) }}
            onDoubleClick={(event) => { event.stopPropagation(); onFeatureEdit(guideId) }}
          >
            <polyline points={`${anchor.x},${anchor.y} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`} className="sgrna-map-leader" />
            {selected
              ? <SelectedMapCalloutLabel
                  label={label}
                  x={x}
                  y={connectorEnd.y}
                  textAnchor={textAnchor}
                  fontSize={SG_RNA_MAP_LABEL_FONT_SIZE_PX}
                  fontWeight={SG_RNA_MAP_LABEL_FONT_WEIGHT}
                  textClassName="sgrna-map-name"
                />
              : <text x={x} y={connectorEnd.y} textAnchor={textAnchor} dominantBaseline="middle" className="sgrna-map-name">{label}</text>}
          </g>
        }
        if (primerMeta) {
          // Thin annealed line beside the ruler: top/forward outside, bottom/reverse inside.
          const primerRingRadius = primerMeta.strand === 'forward' ? radius + PRIMER_RULER_OFFSET_PX : radius - PRIMER_RULER_OFFSET_PX
          const primerAnchor = point(primerMeta.anneal5Prime, 0, primerRingRadius)
          const selected = primerIsSelectedOnMap(primerMeta.primerId, selectedPrimerId, selectedPrimerIds)
          const accent = primerMapAccentColor(primerMeta.color, selected)
          const primerStroke = { stroke: accent }
          return (
            <g
              key={poseKey}
              data-map-primer-id={primerMeta.primerId}
              className={`enzyme-callout primer-callout${selected ? ' is-selected' : ''}${manualLabelPlacement ? ' is-draggable' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                if (!manualLabelPlacement) onPrimerSelect(primerMeta.primerId, event.shiftKey || event.ctrlKey || event.metaKey)
              }}
              onDoubleClick={(event) => {
                if (manualLabelPlacement || !onPrimerEdit) return
                event.stopPropagation()
                event.preventDefault()
                onPrimerEdit(primerMeta.primerId)
              }}
              onPointerDown={(event) => {
                if (beginManualDrag(event)) return
                event.stopPropagation()
              }}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <polyline
                points={`${primerAnchor.x},${primerAnchor.y} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`}
                className={!selected && contrastTextColor(primerMeta.color) === '#fff' ? 'primer-dark-color-leader' : undefined}
                style={{
                  ...primerStroke,
                  '--primer-dark-contrast-color': darkThemePrimerColor(primerMeta.color),
                } as CSSProperties}
              />
              {selected ? (
                <SelectedPrimerMapLabel
                  label={label}
                  x={renderedLabelX}
                  y={connectorEnd.y}
                  textAnchor={textAnchor}
                  fontSize={outsideLabelFontSizePx}
                  fontWeight={primerFontWeight}
                />
              ) : (
                <text
                  x={renderedLabelX}
                  y={connectorEnd.y}
                  textAnchor={textAnchor}
                  dominantBaseline="alphabetic"
                  dy="0.35em"
                  className={contrastTextColor(primerMeta.color) === '#fff' ? 'primer-label-needs-light-ink' : undefined}
                  style={{
                    fontSize: outsideLabelFontSizePx,
                    fontWeight: primerFontWeight,
                    fill: primerMeta.color,
                    '--primer-dark-contrast-color': darkThemePrimerColor(primerMeta.color),
                  } as CSSProperties}
                >
                  <MapCalloutLabelContent label={label} kind="primer" anchor={textAnchor} />
                </text>
              )}
            </g>
          )
        }
        const labelStyle = enzymeLabelDisplayStyle(site, enzymePreferences, enzymeCounts)
        const isUnique =
          enzymePreferences.boldUniqueCutters && uniqueEnzymeCalloutKeys.has(siteKey(site))
        const selected = restrictionSiteIsSelected(site, selectedRestrictionSites)
        const weight = labelStyle.bold ? uniqueEnzymeFontWeight : enzymeFontWeight
        const displayedLabel = mapCalloutLabelParts(label, 'enzyme', textAnchor).text
        const hovered = enzymeCalloutMatchesHover(displayedLabel, hoveredEnzymeName)
        return (
          <g
            key={poseKey}
            data-map-enzyme-site={siteKey(site)}
            className={`enzyme-callout${isUnique ? ' is-unique' : ''}${selected ? ' is-selected' : ''}${manualLabelPlacement ? ' is-draggable' : ''}${hovered ? ' is-enzyme-hovered' : ''}`}
            onPointerEnter={(event) => setHoveredEnzymeName(restrictionSiteFromCalloutClick(event, displayedLabel, site, restrictionSites).enzyme.name)}
            onPointerMove={(event) => setHoveredEnzymeName(restrictionSiteFromCalloutClick(event, displayedLabel, site, restrictionSites).enzyme.name)}
            onPointerLeave={() => setHoveredEnzymeName(null)}
            onClick={(event) => {
              event.stopPropagation()
              if (!manualLabelPlacement) {
                onRestrictionSelect(
                  restrictionSiteFromCalloutClick(event, displayedLabel, site, restrictionSites),
                  event.shiftKey || event.ctrlKey || event.metaKey,
                )
              }
            }}
            onDoubleClick={(event) => {
              if (manualLabelPlacement) return
              openEnzymeInfoFromCalloutGroup(event, displayedLabel, site.enzyme.name, onEnzymeInfo)
            }}
            onPointerDown={(event) => {
              if (beginManualDrag(event)) return
              event.stopPropagation()
            }}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <polyline points={`${anchor.x},${anchor.y} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`} />
            <g onPointerMove={(event) => {
              const hoveredSite = restrictionSiteFromCalloutClick(event, displayedLabel, site, restrictionSites)
              const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
              const mapCenterX = svgRect ? svgRect.left + svgRect.width / 2 : window.innerWidth / 2
              const horizontalSide = event.clientX < mapCenterX ? 'left' : 'right'
              enzymeTooltip.hover(hoveredSite, enzymeCounts[hoveredSite.enzyme.name] ?? 0, event.clientX, event.clientY, 'pointer', false, undefined, horizontalSide)
            }} onPointerLeave={enzymeTooltip.dismiss} onPointerDown={enzymeTooltip.dismiss}>
            {selected ? (
              <SelectedMapCalloutLabel
                label={label}
                mapCalloutKind="enzyme"
                x={renderedLabelX}
                y={connectorEnd.y}
                textAnchor={textAnchor}
                fontSize={outsideLabelFontSizePx}
                fontWeight={weight}
              />
            ) : (
              <EnzymeCalloutLabelText
                label={label}
                mapCalloutKind="enzyme"
                x={renderedLabelX}
                y={connectorEnd.y}
                textAnchor={textAnchor}
                labelStyle={labelStyle}
                fontSize={outsideLabelFontSizePx}
                fontWeight={weight}
                onEnzymeInfo={onEnzymeInfo}
              />
            )}
            </g>
          </g>
        )
      })}

      {/* Product Vector/Insert bands sit above enzyme leaders so leaders tuck under the temp features. */}
      {featureDrawableSegments(rulerTrackFeatures, record.sequence.length).map((segment, index) => {
        const label = segment.feature.name.trim()
        const span =
          segment.end >= segment.start
            ? segment.end - segment.start
            : record.sequence.length - segment.start + segment.end
        const mid = segment.start + span / 2
        const midNorm =
          record.topology === 'circular'
            ? ((mid % record.sequence.length) + record.sequence.length) % record.sequence.length
            : Math.min(record.sequence.length, Math.max(0, mid))
        const shouldReverseText =
          record.topology === 'circular' &&
          midNorm > record.sequence.length * 0.25 &&
          midNorm < record.sequence.length * 0.75
        const labelPathId = `${svgIdScope}-ruler-seg-label-${index}`
        const labelPath = shouldReverseText
          ? arcForRangeDirected(segment.end, segment.start, 0, radius, 0, span)
          : arcForRangeDirected(segment.start, segment.end, 0, radius, 1, span)
        const arcLengthPx =
          (span / Math.max(1, record.sequence.length)) * circularMapSweepRadians(record.topology) * radius
        const showLabel = label.length > 0 && arcLengthPx >= label.length * 6.2 + 10
        return (
          <g key={`ruler-${segment.segmentId}`} className="map-ruler-segment-group" pointerEvents="none">
            <path
              d={arcForRange(segment.start, segment.end, 0, radius)}
              className="map-ruler-segment"
              style={{ stroke: segment.feature.color }}
            />
            {showLabel ? (
              <>
                <path id={labelPathId} d={labelPath} className="feature-label-path" />
                <text
                  className="map-ruler-segment-label map-label-arc"
                  style={{ fill: contrastTextColor(segment.feature.color) }}
                >
                  <textPath
                    href={`#${labelPathId}`}
                    startOffset="50%"
                    textAnchor="middle"
                    fill={contrastTextColor(segment.feature.color)}
                  >
                    {label}
                  </textPath>
                </text>
              </>
            ) : null}
          </g>
        )
      })}

      {routerDebugEnabled && (
        <g className="router-debug-overlay" pointerEvents="none" data-layout-mode={mapLayoutMode}>
          {enzymeCallouts.map((callout) => (
            <rect
              key={`router-debug-enzyme-${callout.index}-${callout.site.start}`}
              x={callout.box.left}
              y={callout.box.top}
              width={callout.box.right - callout.box.left}
              height={callout.box.bottom - callout.box.top}
              fill="none"
              stroke={mapLayoutMode === 'packedFallback' ? 'var(--vg-danger-border)' : 'var(--vg-success-border)'}
              strokeOpacity="0.55"
              strokeWidth="0.8"
            />
          ))}
          {[...featureCallouts.values()]
            .filter(
              (
                layout,
              ): layout is {
                kind: 'outer'
                callout: ReturnType<typeof layoutEnzymeCallouts>[number]
                renderLevel: number
              } => layout.kind === 'outer',
            )
            .map((layout, index) => (
              <rect
                key={`router-debug-feature-${index}`}
                x={layout.callout.box.left}
                y={layout.callout.box.top}
                width={layout.callout.box.right - layout.callout.box.left}
                height={layout.callout.box.bottom - layout.callout.box.top}
                fill="none"
                stroke="var(--vg-focus)"
                strokeOpacity="0.45"
                strokeWidth="0.8"
              />
            ))}
        </g>
      )}

      <g className="map-ruler-labels" pointerEvents="none">
        {rulerMarks.map((position) => {
          const label = `${position.toLocaleString()} bp`
          const labelWidth = measureTextWidthPx(
            label,
            `650 ${CIRCULAR_RULER_LABEL_FONT_PX}px system-ui, -apple-system, "Segoe UI", sans-serif`,
            5.4,
          )
          const arc = circularRulerLabelArc(
            position,
            record.sequence.length,
            rulerLabelRadius,
            labelWidth,
            record.topology,
          )
          const labelPathId = `${svgIdScope}-ruler-label-${position}`
          return (
            <g key={position}>
              <path
                id={labelPathId}
                d={arcForRangeDirected(arc.start, arc.end, 0, rulerLabelRadius, arc.sweepFlag, arc.span)}
                className="feature-label-path"
              />
              <text className="map-ruler-label map-label-arc map-label-off-body" dominantBaseline="central">
                <textPath
                  href={`#${labelPathId}`}
                  startOffset="0%"
                  textAnchor="start"
                  dominantBaseline="central"
                >
                  {label}
                </textPath>
              </text>
            </g>
          )
        })}
      </g>

      {(() => {
        const titleX = titleInsideCircle ? ringDrawCenterX : centerX
        const titleY = titleInsideCircle ? ringDrawCenterY - 6 : fittedViewBox.contentBottom + 20
        const subtitleY = titleInsideCircle ? ringDrawCenterY + 16 : fittedViewBox.contentBottom + 40
        const editorWidth = Math.max(160, titleTextWidthEstimate + 40)
        return (
          <>
            {editingTitle ? (
              <foreignObject
                x={titleX - editorWidth / 2}
                y={titleY - 20}
                width={editorWidth}
                height={30}
              >
                <input
                  className="map-title-input"
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={commitTitleEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitTitleEdit()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelTitleEdit()
                    }
                    event.stopPropagation()
                  }}
                />
              </foreignObject>
            ) : (
              <text
                x={titleX}
                y={titleY}
                textAnchor="middle"
                className={`map-title${onRenameRecord || onEditMapLabel ? ' is-editable' : ''}`}
                onPointerDown={onRenameRecord || onEditMapLabel ? (event) => event.stopPropagation() : undefined}
                onPointerUp={onRenameRecord || onEditMapLabel ? (event) => event.stopPropagation() : undefined}
                onDoubleClick={onRenameRecord || onEditMapLabel ? beginTitleEdit : undefined}
              >
                {onRenameRecord || onEditMapLabel ? <title>Double-click to edit</title> : null}
                {displayedMapLabel}
              </text>
            )}
            <text x={titleX} y={subtitleY} textAnchor="middle" className="map-subtitle">
              {mapSubtitle}
            </text>
          </>
        )
      })()}
      </g>
    </svg>
  )
}
