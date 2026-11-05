import { isOrfFeature } from '../../domain/orfPrediction'
import {
  collectLayoutViolations,
  layoutEnzymeCallouts,
  layoutEnzymeCalloutsPacked,
  layoutEnzymeCalloutsStrict,
  hasNonBoundsLayoutViolations,
  leaderBendAngleDegrees,
  type EnzymeCallout,
  type EnzymeCalloutLayoutInput,
  type EnzymeCalloutLayoutResult,
} from '../../domain/mapLayout'
import { enforceAllOrNoneEnzymeCallouts, expectedEnzymeSiteCounts } from '../../domain/enzymeLabelBudget'
import {
  CIRCULAR_FEATURE_HALF_WIDTH_PX,
  circularFeatureLevelLimit,
  circularMapTitleFitsInsideRing,
} from '../../domain/circularMapResponsive'
import { layoutCircularLaneCalloutsStrict, summarizeCircularLayout } from '../../domain/circularLaneRouter'
import { layoutCircularEllipticCalloutsStrict } from '../../domain/circularEllipticRouter'
import { circularMapPolarPoint, circularMapSweepRadians } from '../../domain/circularMapGeometry'
import { preferredFeatureLabelSegmentIds } from '../../domain/featureLabelPlacement'
import type { RestrictionSite, SequenceRecord } from '../../domain/types'
import {
  constrainCircularFeatureLevels,
  featureGapConnectors,
  featureLevelBand,
  featurePriority,
  type FeatureRenderInfo,
} from './featureRendering'
import { calloutLabelForSite, featureDisplayName } from './mapPrimitives'
import { elapsedMs, type RouterClock, type RouterProfileEntry } from './circularMapDiagnostics'

export type MapLayoutMode = 'standard' | 'packedFallback' | 'arcOverflow'

/** Router results can omit enzyme callouts, so array positions are not input indices. */
export function splitCircularFeatureCallouts<T>(
  callouts: EnzymeCallout[],
  baseSiteCount: number,
  candidates: Array<{ info: T }>,
) {
  const baseCallouts: EnzymeCallout[] = []
  const featureCallouts: Array<{ info: T; callout: EnzymeCallout }> = []
  for (const callout of callouts) {
    if (callout.index < baseSiteCount) {
      baseCallouts.push(callout)
      continue
    }
    const candidate = candidates[callout.index - baseSiteCount]
    if (candidate) featureCallouts.push({ info: candidate.info, callout })
  }
  return { baseCallouts, featureCallouts }
}

const MAX_INNER_FEATURE_LABELS = 60
const CIRCULAR_MAP_CONTENT_PADDING_PX = 10
const CIRCULAR_MAP_BELOW_TITLE_HEIGHT_PX = 54
const RENDERED_BEND_TARGET_DEGREES = 120

type CircularMapLayoutDisplaySettings = {
  features: { labelsVisible: boolean }
  labelRouting: {
    labelCurveShape?: 'ellipse' | 'arcs'
    ellipticRaySlideEnabled?: boolean
    ellipticRaySlideClearancePx?: number
    ellipticRadialImplodeEnabled?: boolean
    ellipticRadialImplodeClearancePx?: number
    ellipticRadialImplodeMinRingDistancePx?: number
    ellipticBalanceRing?: boolean
    ellipticRingGap: number
    ellipticSideBudget?: number | null
    ellipticHorizontalGapPx: number | null
    ellipticVerticalGapPx: number | null
    arcHorizontalGapPx?: number | null
    arcUpperVerticalGapPx?: number | null
    arcLowerVerticalGapPx?: number | null
    arcUpperTipAngleDegrees?: number | null
    arcLowerTipAngleDegrees?: number | null
    arcCompactOverflowLabels?: boolean
  }
}

export type CircularMapLayoutHelperScope = {
  record: SequenceRecord
  centerX: number
  centerY: number
  responsiveMapPolicy: ReturnType<typeof import('../../domain/circularMapResponsive').resolveCircularMapResponsivePolicy>
  featureTrackStart: number
  nominalFeatureTrackGap: number
  renderedFeatures: FeatureRenderInfo[]
  orfRenderedFeatures: FeatureRenderInfo[]
  featureInlineFontSizePx: number
  titleTextWidthEstimate: number
  displaySettings: CircularMapLayoutDisplaySettings
  allowOuterFeatureLabels: boolean
  circularRouterAlgorithm: string
  circularRouterCompareEnabled: boolean
  routerProfileEnabled: boolean
  routerPackedDebugEnabled: boolean
  layoutMapSize: number
  layoutMapWidth: number
  layoutMapHeight: number
  enzymeOuterOffset: number
  ellipticOvoidK: number
  showEnzymePositions: boolean
  outsideLabelFontSizePx: number
  enzymeCalloutSites: RestrictionSite[]
  primerCalloutSites: RestrictionSite[]
  prioritizedOuterFeatureBudget: number
  mapSize: number
  circularCalloutPadding: (site: RestrictionSite) => number
  circularCalloutTextWidth: (site: RestrictionSite, label: string) => number
  /** Compute expensive violation details only when diagnostics are enabled. */
  includeViolationDetails?: boolean
  /** Rebuild the rendered ring anchor used for final geometry validation. */
  renderedCalloutAnchor?: (
    callout: EnzymeCallout,
    returnedCenter: { x: number; y: number },
    radius: number,
  ) => { x: number; y: number }
}

export function createCircularMapLayoutHelpers(scope: CircularMapLayoutHelperScope) {
  const {
    record,
    centerX,
    centerY,
    responsiveMapPolicy,
    featureTrackStart,
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
    circularCalloutPadding,
    circularCalloutTextWidth,
    renderedCalloutAnchor,
    includeViolationDetails = false,
  } = scope

  const titleInsideAtRadiusCache = new Map<number, boolean>()

  function polarPoint(position: number, offset: number, baseRadius: number, center = { x: centerX, y: centerY }) {
    return circularMapPolarPoint(position, record.sequence.length, center.x, center.y, baseRadius, offset, record.topology)
  }

  function layoutArcDirected(
    startPosition: number,
    endPosition: number,
    offset: number,
    baseRadius: number,
    sweepFlag: 0 | 1 = 1,
    explicitSpan?: number,
    center?: { x: number; y: number },
  ) {
    const start = polarPoint(startPosition, offset, baseRadius, center)
    const end = polarPoint(endPosition, offset, baseRadius, center)
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

  function featureTrackGapFor(_mapRadius: number) {
    void _mapRadius
    // Keep a readable ring spacing; drop deeper rows instead of compressing gaps.
    return nominalFeatureTrackGap
  }

  function featureLevelLimitAt(mapRadius: number) {
    const policyLimit = Math.min(
      circularFeatureLevelLimit(responsiveMapPolicy.shortSide, mapRadius),
      responsiveMapPolicy.featureLevelLimit,
    )
    const usableDepth = Math.max(0, mapRadius - 52 - featureTrackStart)
    const fitByGap = Math.max(0, Math.floor(usableDepth / nominalFeatureTrackGap))
    return Math.min(policyLimit, fitByGap)
  }

  function featureRadiusAt(level: number, mapRadius: number) {
    return mapRadius - (featureTrackStart + level * featureTrackGapFor(mapRadius))
  }

  function featureSpan(info: FeatureRenderInfo) {
    return info.end >= info.start ? info.end - info.start : record.sequence.length - info.start + info.end
  }

  function featureLabelFitsAtRadius(info: FeatureRenderInfo, mapRadius: number) {
    const length = record.sequence.length
    if (length <= 0) return false
    const charWidth = featureInlineFontSizePx * 0.56
    const labelWidth = featureDisplayName(info.feature).length * charWidth + 12
    const arcLength = (featureSpan(info) / length) * circularMapSweepRadians(record.topology) * featureRadiusAt(info.level, mapRadius)
    return arcLength >= labelWidth && featureSpan(info) > length * 0.035
  }

  function featureLabelArcAtRadius(info: FeatureRenderInfo, labelRadius: number, center?: { x: number; y: number }) {
    const mid = (info.start + info.end) / 2
    const shouldReverseText = mid > record.sequence.length * 0.25 && mid < record.sequence.length * 0.75
    const span = featureSpan(info)
    return shouldReverseText ? layoutArcDirected(info.end, info.start, 0, labelRadius, 0, span, center) : layoutArcDirected(info.start, info.end, 0, labelRadius, 1, span, center)
  }

  /** Short mid-feature arc for a noColor label backdrop (path stroke, not glyph stroke). */
  function featureNoColorLabelBackdropArc(info: FeatureRenderInfo, labelRadius: number, labelWidthPx: number, center?: { x: number; y: number }) {
    const length = Math.max(1, record.sequence.length)
    const mid = ((info.start + info.end) / 2 + length) % length
    const sweep = circularMapSweepRadians(record.topology) * labelRadius
    // The caller supplies text width plus the compact visual padding. Keep
    // layout-fit reserves out of the visible knockout.
    const pad = 0
    const spanBp = Math.min(
      featureSpan(info),
      Math.max(12, Math.ceil(((labelWidthPx + pad) / Math.max(1, sweep)) * length)),
    )
    const half = spanBp / 2
    let start = mid - half
    let end = mid + half
    if (record.topology === 'circular') {
      start = ((start % length) + length) % length
      end = ((end % length) + length) % length
    } else {
      start = Math.max(0, start)
      end = Math.min(length, end)
    }
    const shouldReverseText = mid > length * 0.25 && mid < length * 0.75
    const span = end >= start ? end - start : length - start + end
    return shouldReverseText
      ? layoutArcDirected(end, start, 0, labelRadius, 0, span, center)
      : layoutArcDirected(start, end, 0, labelRadius, 1, span, center)
  }

  function featureInnerLabelAtRadius(info: FeatureRenderInfo, radialUnits: number, withLine: boolean, mapRadius: number) {
    const midpoint = (info.start + info.end) / 2
    const anchor = polarPoint(midpoint, 0, featureRadiusAt(info.level, mapRadius))
    const labelRadius = Math.max(34, featureRadiusAt(info.level, mapRadius) - radialUnits * featureTrackGapFor(mapRadius))
    const labelWidth = featureDisplayName(info.feature).length * featureInlineFontSizePx * 0.56 + 14
    const labelSpan = Math.min(record.sequence.length * 0.24, Math.max(record.sequence.length * 0.025, (labelWidth / (circularMapSweepRadians(record.topology) * labelRadius)) * record.sequence.length))
    const labelStart = midpoint - labelSpan / 2
    const labelEnd = midpoint + labelSpan / 2
    const labelPath = featureLabelArcAtRadius({ ...info, start: labelStart, end: labelEnd }, labelRadius)
    const labelPoint = polarPoint(midpoint, 0, labelRadius)
    return { kind: 'inner' as const, anchor, labelPoint, labelPath, labelStart, labelEnd, withLine }
  }

  function circularRanges(start: number, end: number) {
    const length = record.sequence.length
    const normalizedStart = ((start % length) + length) % length
    const normalizedEnd = ((end % length) + length) % length
    const span = end >= start ? end - start : length - start + end
    if (span >= length) return [{ start: 0, end: length }]
    return normalizedEnd >= normalizedStart
      ? [{ start: normalizedStart, end: normalizedEnd }]
      : [
          { start: normalizedStart, end: length },
          { start: 0, end: normalizedEnd },
        ]
  }

  function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
    return circularRanges(aStart, aEnd).some((a) => circularRanges(bStart, bEnd).some((b) => a.start < b.end && b.start < a.end))
  }

  function featureSitesForOuterFeatures(outerFeatureInfos: FeatureRenderInfo[]) {
    return outerFeatureInfos.map((info) => {
      const midpoint = Math.round((info.start + info.end) / 2) % record.sequence.length
      return {
        enzyme: {
          name: featureDisplayName(info.feature),
          notation: '',
          recognition: '',
          cutTop: 0,
          cutBottom: 0,
          type: 'II' as const,
          overhang: { type: 'blunt' as const, sequence: null, length: 0 },
          manufacturers: [],
          notes: [],
        },
        start: midpoint,
        end: midpoint,
        match: '__feature_callout__',
        cutTop: midpoint,
        cutBottom: midpoint,
      }
    })
  }

  function externalFeatureCandidates(outerFeatureInfos: FeatureRenderInfo[]) {
    return outerFeatureInfos
      .map((info) => ({
        info,
        site: featureSitesForOuterFeatures([info])[0],
      }))
      .toSorted(
        (a, b) =>
          Number(Boolean(b.info.feature.prioritizeDisplay)) -
            Number(Boolean(a.info.feature.prioritizeDisplay)) ||
          featurePriority(a.info.feature.type) - featurePriority(b.info.feature.type) ||
          featureSpan(b.info) - featureSpan(a.info) ||
          featureDisplayName(a.info.feature).localeCompare(featureDisplayName(b.info.feature)),
      )
  }

  function runStrictCircularLayout(
    input: EnzymeCalloutLayoutInput,
    options: { compare?: boolean } = {},
    profileClock: RouterClock | null = null,
  ): EnzymeCalloutLayoutResult {
    // The comparison runs the classic O(n²) router; only do it on the final render pass,
    // never inside the radius search (which calls this dozens of times per frame).
    if (circularRouterCompareEnabled && options.compare && profileClock) {
      const classicStarted = profileClock.now()
      const classic = layoutEnzymeCalloutsStrict(input)
      const classicMs = elapsedMs(profileClock, classicStarted)
      const laneStarted = profileClock.now()
      const lane = layoutCircularLaneCalloutsStrict(input)
      const laneMs = elapsedMs(profileClock, laneStarted)
      const ellipticStarted = profileClock.now()
      const elliptic = layoutCircularEllipticCalloutsStrict(input)
      const ellipticMs = elapsedMs(profileClock, ellipticStarted)
      console.info('[circularRouter][compare]', {
        radius: input.radius,
        sites: input.sites.length,
        classic: {
          ms: Number(classicMs.toFixed(2)),
          placed: classic.callouts.length,
          fail: classic.hasPlacementFailure ? 1 : 0,
          violations: collectLayoutViolations(classic.callouts, input).length,
          ...summarizeCircularLayout(classic.callouts, input),
        },
        lane: {
          ms: Number(laneMs.toFixed(2)),
          placed: lane.callouts.length,
          fail: lane.hasPlacementFailure ? 1 : 0,
          violations: collectLayoutViolations(lane.callouts, input).length,
          ...summarizeCircularLayout(lane.callouts, input),
        },
        elliptic: {
          ms: Number(ellipticMs.toFixed(2)),
          placed: elliptic.callouts.length,
          fail: elliptic.hasPlacementFailure ? 1 : 0,
          violations: collectLayoutViolations(elliptic.callouts, input).length,
          ...summarizeCircularLayout(elliptic.callouts, input),
        },
      })
    }

    const raw =
      circularRouterAlgorithm === 'lane'
        ? layoutCircularLaneCalloutsStrict(input)
        : circularRouterAlgorithm === 'elliptic'
          ? layoutCircularEllipticCalloutsStrict(input)
          : layoutEnzymeCalloutsStrict(input)
    const inputEnzymeExpectations = expectedEnzymeSiteCounts(input.sites)
    const enforced = enforceAllOrNoneEnzymeCallouts(raw.callouts, inputEnzymeExpectations)
    const droppedPartial = enforced.droppedEnzymes.length > 0
    if (droppedPartial && routerProfileEnabled) {
      console.info('[circularRouter][allOrNone]', {
        droppedEnzymes: enforced.droppedEnzymes,
        before: raw.callouts.length,
        after: enforced.callouts.length,
        expectedFromInput: [...inputEnzymeExpectations.entries()],
      })
    }
    return {
      callouts: enforced.callouts,
      hasPlacementFailure: raw.hasPlacementFailure || droppedPartial,
      overflowMode: raw.overflowMode,
      ringCenter: raw.ringCenter,
      routingQuality: raw.routingQuality,
    }
  }

  function calloutLayoutInput(
    sites: RestrictionSite[],
    mapRadius: number,
    debugSink?: Array<Record<string, unknown>>,
    optimizationPass: 'coarse' | 'final' = 'final',
    centerOverride?: { x: number; y: number },
  ) {
    const inputCenterX = centerOverride?.x ?? centerX
    const inputCenterY = centerOverride?.y ?? centerY
    return {
      sites,
      sequenceLength: record.sequence.length,
      topology: record.topology,
      mapSize: layoutMapSize,
      mapWidth: layoutMapWidth,
      mapHeight: layoutMapHeight,
      bottomReservedPx:
        circularRouterAlgorithm === 'elliptic' && !titleFitsInsideAtRadius(mapRadius)
          ? CIRCULAR_MAP_CONTENT_PADDING_PX + CIRCULAR_MAP_BELOW_TITLE_HEIGHT_PX
          : 0,
      center: inputCenterX,
      centerX: inputCenterX,
      centerY: inputCenterY,
      radius: mapRadius,
      outerFeatureOffset: enzymeOuterOffset,
      rulerContactOffset: 1,
      labelCurveShape: displaySettings.labelRouting.labelCurveShape ?? 'arcs',
      ovoidK: ellipticOvoidK,
      raySlideEnabled: displaySettings.labelRouting.ellipticRaySlideEnabled === true,
      raySlideClearancePx: displaySettings.labelRouting.ellipticRaySlideClearancePx ?? 4,
      radialImplodeEnabled: displaySettings.labelRouting.ellipticRadialImplodeEnabled === true,
      radialImplodeClearancePx: displaySettings.labelRouting.ellipticRadialImplodeClearancePx ?? 4,
      radialImplodeMinRingDistancePx: displaySettings.labelRouting.ellipticRadialImplodeMinRingDistancePx ?? 24,
      balanceRing: displaySettings.labelRouting.ellipticBalanceRing !== false,
      optimizationPass,
      ringGap: displaySettings.labelRouting.ellipticRingGap ?? 0,
      ...(responsiveMapPolicy.sideBudgetOverride !== undefined
        ? { sideBudget: responsiveMapPolicy.sideBudgetOverride }
        : {}),
      adaptiveSideBudget: displaySettings.labelRouting.ellipticSideBudget == null,
      ...(displaySettings.labelRouting.ellipticHorizontalGapPx !== null
        ? { ellipticHorizontalGapPx: displaySettings.labelRouting.ellipticHorizontalGapPx }
        : {}),
      ...(displaySettings.labelRouting.ellipticVerticalGapPx !== null
        ? { ellipticVerticalGapPx: displaySettings.labelRouting.ellipticVerticalGapPx }
        : {}),
      ...(displaySettings.labelRouting.arcHorizontalGapPx != null
        ? { arcHorizontalGapPx: displaySettings.labelRouting.arcHorizontalGapPx }
        : {}),
      ...(displaySettings.labelRouting.arcUpperVerticalGapPx != null
        ? { arcUpperVerticalGapPx: displaySettings.labelRouting.arcUpperVerticalGapPx }
        : {}),
      ...(displaySettings.labelRouting.arcLowerVerticalGapPx != null
        ? { arcLowerVerticalGapPx: displaySettings.labelRouting.arcLowerVerticalGapPx }
        : {}),
      ...(displaySettings.labelRouting.arcUpperTipAngleDegrees != null
        ? { arcUpperTipAngleDegrees: displaySettings.labelRouting.arcUpperTipAngleDegrees }
        : {}),
      ...(displaySettings.labelRouting.arcLowerTipAngleDegrees != null
        ? { arcLowerTipAngleDegrees: displaySettings.labelRouting.arcLowerTipAngleDegrees }
        : {}),
      arcCompactOverflowLabels:
        displaySettings.labelRouting.arcCompactOverflowLabels === true,
      labelForSite: (site: RestrictionSite) => calloutLabelForSite(site, showEnzymePositions),
      textHeightForSite: (site: RestrictionSite) =>
        site.match === '__feature_callout__'
          ? outsideLabelFontSizePx + 14
          : site.match.startsWith('__primer_callout__')
            ? outsideLabelFontSizePx + 4
            : outsideLabelFontSizePx + 2,
      labelPaddingForSite: (site: RestrictionSite) => circularCalloutPadding(site),
      labelWidthForSite: (site: RestrictionSite, label: string) =>
        circularCalloutTextWidth(site, label),
      debugLog: debugSink ? (entry: Record<string, unknown>) => debugSink.push(entry) : undefined,
    }
  }

  function routableCombinedCallouts(
    outerFeatureInfos: FeatureRenderInfo[],
    mapRadius: number,
    options: {
      profileEntries?: RouterProfileEntry[]
      nonBoundsOnly?: boolean
      packedFallback?: boolean
      knownStrictInvalid?: boolean
      compare?: boolean
      optimizationPass?: 'coarse' | 'final'
      centerOverride?: { x: number; y: number }
    } = {},
    profileClock: RouterClock | null = null,
  ) {
    const {
      profileEntries,
      nonBoundsOnly = false,
      packedFallback = false,
      knownStrictInvalid = false,
      compare = false,
      optimizationPass = 'final',
      centerOverride,
    } = options
    const started = profileEntries && profileClock ? profileClock.now() : 0
    const rankedOuterCandidates = externalFeatureCandidates(outerFeatureInfos)
    const selectedOuterCandidates = rankedOuterCandidates.slice(0, prioritizedOuterFeatureBudget)
    // Enzyme set is already all-or-none budgeted; never slice mid-enzyme for outer features.
    const selectedEnzymeSites = enzymeCalloutSites
    const baseSites = [...selectedEnzymeSites, ...primerCalloutSites]

    if (packedFallback && knownStrictInvalid) {
      const packedInput = calloutLayoutInput(
        [...baseSites, ...selectedOuterCandidates.map((candidate) => candidate.site)],
        mapRadius,
        undefined,
        'final',
        centerOverride,
      )
      const packedRaw = layoutEnzymeCalloutsPacked(packedInput)
      const packedCallouts = enforceAllOrNoneEnzymeCallouts(
        packedRaw,
        expectedEnzymeSiteCounts(packedInput.sites),
      ).callouts
      profileEntries?.push({
        step: 'routableCombinedCallouts.packedFromRadius',
        ms: elapsedMs(profileClock, started),
        details: `r=${mapRadius} labels=${packedCallouts.length}`,
      })
      return {
        callouts: packedCallouts,
        candidates: selectedOuterCandidates,
        violations: [],
        baseSiteCount: baseSites.length,
        packedUsed: true,
        strictInvalid: true,
        placementFailure: null,
        nonBoundsGeometryViolation: null,
        mode: 'packedFallback' as const,
      }
    }

    function evaluateWithOuterCount(outerCount: number) {
      const candidates = selectedOuterCandidates.slice(0, outerCount)
      const input = calloutLayoutInput(
        [...baseSites, ...candidates.map((candidate) => candidate.site)],
        mapRadius,
        undefined,
        optimizationPass,
        centerOverride,
      )
      const strictLayout = runStrictCircularLayout(input, { compare }, profileClock)
      // The elliptic router may move the ring while leaving the viewport fixed. Validate the
      // returned leader geometry against the actual ring, not the original layout midpoint.
      const returnedCenter = strictLayout.ringCenter ?? { x: input.centerX ?? input.center, y: input.centerY ?? input.center }
      const validationInput = strictLayout.ringCenter
        ? { ...input, centerX: strictLayout.ringCenter.x, centerY: strictLayout.ringCenter.y }
        : input
      const validationCallouts = renderedCalloutAnchor
        ? strictLayout.callouts.map((callout) => {
            const anchor = renderedCalloutAnchor(callout, returnedCenter, mapRadius)
            return {
              ...callout,
              anchor,
              segments: [
                [anchor, callout.elbow],
                [callout.elbow, callout.connectorEnd],
              ] as EnzymeCallout['segments'],
            }
          })
        : strictLayout.callouts
      const routingQuality = strictLayout.routingQuality && renderedCalloutAnchor
        ? (() => {
            const bends = validationCallouts
              .map((callout) => leaderBendAngleDegrees(callout))
              .filter((angle): angle is number => angle !== null)
            return {
              ...strictLayout.routingQuality,
              minBendAngle: bends.length ? Math.min(...bends) : 180,
              meanBendAngle: bends.length
                ? bends.reduce((sum, angle) => sum + angle, 0) / bends.length
                : 180,
              belowTargetBendCount: bends.filter((angle) => angle < RENDERED_BEND_TARGET_DEGREES).length,
              belowTargetBendSeverity: bends.reduce(
                (sum, angle) => sum + Math.max(0, RENDERED_BEND_TARGET_DEGREES - angle),
                0,
              ),
            }
          })()
        : strictLayout.routingQuality
      const nonBoundsGeometryViolation = hasNonBoundsLayoutViolations(validationCallouts, validationInput)
      const nonBoundsViolations = strictLayout.hasPlacementFailure || nonBoundsGeometryViolation
      const allViolations =
        strictLayout.hasPlacementFailure ||
        (strictLayout.overflowMode
          ? nonBoundsViolations
          : collectLayoutViolations(validationCallouts, validationInput).length > 0)
      const hasViolations = nonBoundsOnly ? nonBoundsViolations : allViolations
      const callouts = strictLayout.callouts
      return {
        candidates,
        input: validationInput,
        callouts,
        validationCallouts,
        hasViolations,
        placementFailure: strictLayout.hasPlacementFailure,
        nonBoundsGeometryViolation,
        // Radius selection must use the same returned-center geometric validation as
        // rendering. Placement failure alone does not detect every leader/label crossing.
        strictInvalid: nonBoundsViolations,
        overflowMode: strictLayout.overflowMode,
        routingQuality,
        ringCenterX: strictLayout.ringCenter?.x,
        ringCenterY: strictLayout.ringCenter?.y,
      }
    }

    // Keep feature labels in every radius trial. Dropping them to make an enzyme layout
    // feasible makes their visibility depend on which enzymes happen to be shown.
    const best = evaluateWithOuterCount(selectedOuterCandidates.length)
    let violations: string[]
    if (includeViolationDetails) {
      const collected = collectLayoutViolations(best.validationCallouts, best.input)
      violations = nonBoundsOnly
        ? collected.filter((violation) => !/out-of-bounds|out of bounds/i.test(violation))
        : collected
      if (!violations.length && best.placementFailure) {
        violations.push('router reported placement failure')
      } else if (!violations.length && best.hasViolations) {
        violations.push(nonBoundsOnly ? 'non-bounds geometry violation' : 'layout violation')
      }
    } else {
      violations = best.hasViolations
        ? [nonBoundsOnly ? 'non-bounds violation detected' : 'placement failure or layout violation detected']
        : nonBoundsOnly
          ? []
          : collectLayoutViolations(best.validationCallouts, best.input)
    }

    // Packed fallback should only react to strict geometric infeasibility,
    // not to generic bounds diagnostics that can be resolved by scrolling.
    if (!nonBoundsOnly && packedFallback && best.hasViolations) {
      const packedDebugEntries: Array<Record<string, unknown>> = []
      const packedInput = calloutLayoutInput(
        [...baseSites, ...selectedOuterCandidates.map((candidate) => candidate.site)],
        mapRadius,
        routerPackedDebugEnabled ? packedDebugEntries : undefined,
        'final',
        centerOverride,
      )
      const packedRaw = layoutEnzymeCalloutsPacked(packedInput)
      const packedCallouts = enforceAllOrNoneEnzymeCallouts(packedRaw, expectedEnzymeSiteCounts(packedInput.sites)).callouts
      if (routerPackedDebugEnabled && packedDebugEntries.length) {
        console.groupCollapsed(`[router][packed-debug] labels=${packedDebugEntries.length} radius=${Math.round(mapRadius)} mapSize=${mapSize} (outer+enzymes)`)
        console.table(packedDebugEntries)
        console.groupEnd()
      }
      if (profileEntries) {
        profileEntries.push({
          step: 'routableCombinedCallouts.packedFallback',
          ms: 0,
          details: `forcedOuter=${selectedOuterCandidates.length}`,
        })
      }
      return {
        callouts: packedCallouts,
        candidates: selectedOuterCandidates,
        violations: [],
        baseSiteCount: baseSites.length,
        packedUsed: true,
        strictInvalid: true,
        placementFailure: best.placementFailure,
        nonBoundsGeometryViolation: best.nonBoundsGeometryViolation,
        mode: 'packedFallback' as const,
      }
    }

    if (profileEntries) {
      profileEntries.push({
        step: 'routableCombinedCallouts',
        ms: elapsedMs(profileClock, started),
        details: `r=${mapRadius} candidatesIn=${outerFeatureInfos.length} kept=${best.candidates.length} violations=${violations.length} strictInvalid=${best.strictInvalid ? 1 : 0}`,
      })
    }

    return {
      callouts: best.callouts,
      candidates: best.candidates,
      violations,
      baseSiteCount: baseSites.length,
      packedUsed: false,
      strictInvalid: best.strictInvalid,
      placementFailure: best.placementFailure,
      nonBoundsGeometryViolation: best.nonBoundsGeometryViolation,
      overflowMode: best.overflowMode,
      routingQuality: best.routingQuality,
      mode: (best.overflowMode ? 'arcOverflow' : 'standard') as MapLayoutMode,
      ringCenterX: best.ringCenterX,
      ringCenterY: best.ringCenterY,
    }
  }

  function renderedFeaturesAtRadius(mapRadius: number) {
    return constrainCircularFeatureLevels(
      renderedFeatures,
      featureLevelLimitAt(mapRadius),
      true,
    )
  }

  function titleFitsInsideAtRadius(
    mapRadius: number,
    plannedLayouts?: ReturnType<typeof featureCalloutPlanAtRadius>['layouts'],
  ) {
    const cached = titleInsideAtRadiusCache.get(mapRadius)
    if (cached !== undefined) return cached

    let innerContentRadius = mapRadius
    const featureLevels = [
      ...renderedFeaturesAtRadius(mapRadius),
      ...constrainCircularFeatureLevels(
        orfRenderedFeatures,
        featureLevelLimitAt(mapRadius),
        false,
      ),
    ]
    for (const feature of featureLevels) {
      innerContentRadius = Math.min(
        innerContentRadius,
        featureRadiusAt(featureLevelBand(feature.level), mapRadius) - CIRCULAR_FEATURE_HALF_WIDTH_PX,
      )
    }
    for (const layout of (plannedLayouts ?? featureCalloutPlanAtRadius(mapRadius).layouts).values()) {
      if (!layout || layout.kind !== 'inner') continue
      const dx = layout.labelPoint.x - centerX
      const dy = layout.labelPoint.y - centerY
      innerContentRadius = Math.min(
        innerContentRadius,
        Math.hypot(dx, dy) - featureInlineFontSizePx,
      )
    }
    const fits = circularMapTitleFitsInsideRing({
      innerContentRadius,
      titleWidth: titleTextWidthEstimate,
    })
    titleInsideAtRadiusCache.set(mapRadius, fits)
    return fits
  }

  function featureCalloutPlanAtRadius(mapRadius: number) {
    if (!displaySettings.features.labelsVisible) {
      return {
        layouts: new Map<
          string,
          ReturnType<typeof featureInnerLabelAtRadius> | {
            kind: 'outer'
            callout: ReturnType<typeof layoutEnzymeCallouts>[number]
            renderLevel: number
          }
        >(),
        outerFeatureInfos: [] as FeatureRenderInfo[],
        preferredLabelSegmentIds: new Set<string>(),
        gapLabelConnectors: new Map<string, ReturnType<typeof featureGapConnectors>[number]>(),
      }
    }

    const radiusFeatures = renderedFeaturesAtRadius(mapRadius)
    const labelableFeatures = radiusFeatures.filter((info) => !isOrfFeature(info.feature))
    const arcFittingSegmentIds = new Set(
      labelableFeatures.filter((info) => featureLabelFitsAtRadius(info, mapRadius)).map((info) => info.segmentId),
    )
    const preferredLabelSegmentIds = preferredFeatureLabelSegmentIds(
      labelableFeatures.map((info) => ({
        feature: info.feature,
        segmentId: info.segmentId,
        start: info.start,
        end: info.end,
        span: featureSpan(info),
      })),
      (candidate) => arcFittingSegmentIds.has(candidate.segmentId),
    )
    const arcFittingFeatureIds = new Set(
      labelableFeatures.filter((info) => arcFittingSegmentIds.has(info.segmentId)).map((info) => info.feature.id),
    )
    const gapLabelConnectors = new Map<string, ReturnType<typeof featureGapConnectors>[number]>()
    const labelWidthForFeature = (featureId: string) => {
      const feature = labelableFeatures.find((info) => info.feature.id === featureId)?.feature
      return feature ? featureDisplayName(feature).length * featureInlineFontSizePx * 0.56 + 12 : Infinity
    }
    featureGapConnectors(radiusFeatures, record.sequence.length).forEach((gap) => {
      if (arcFittingFeatureIds.has(gap.featureId) || gapLabelConnectors.has(gap.featureId)) return
      const radius = featureRadiusAt(gap.level, mapRadius)
      const gapArcLength = ((gap.end - gap.start) / Math.max(1, record.sequence.length)) * circularMapSweepRadians(record.topology) * radius
      if (gapArcLength < labelWidthForFeature(gap.featureId)) return
      const overlapsOtherBody = radiusFeatures.some(
        (other) =>
          other.feature.id !== gap.featureId &&
          featureLevelBand(other.level) === featureLevelBand(gap.level) &&
          rangesOverlap(gap.start, gap.end, other.start, other.end),
      )
      if (!overlapsOtherBody) gapLabelConnectors.set(gap.featureId, gap)
    })
    const labelSegments = labelableFeatures.filter(
      (info) => preferredLabelSegmentIds.has(info.segmentId) && !gapLabelConnectors.has(info.feature.id),
    )

    const occupancy = new Map<number, Array<{ start: number; end: number }>>()
    const layouts = new Map<string, ReturnType<typeof featureInnerLabelAtRadius> | { kind: 'outer'; callout: ReturnType<typeof layoutEnzymeCallouts>[number]; renderLevel: number }>()
    const outerFeatureInfos: FeatureRenderInfo[] = []

    radiusFeatures.forEach((info) => {
      const occupied = occupancy.get(info.level * 2) ?? []
      occupied.push({ start: info.start, end: info.end })
      occupancy.set(info.level * 2, occupied)
    })

    const nonArcFeatures = labelSegments.filter((info) => !featureLabelFitsAtRadius(info, mapRadius))
    const nonArcRanked = nonArcFeatures.toSorted(
      (a, b) =>
        featurePriority(a.feature.type) - featurePriority(b.feature.type) ||
        featureSpan(b) - featureSpan(a) ||
        featureDisplayName(a.feature).localeCompare(featureDisplayName(b.feature)),
    )
    // Inward half-row / full-row label fallbacks sit in the row-1 band. When that band is
    // disabled, skip them — send level-0 labels outside with enzymes/primers, or hide them.
    const allowInwardFeatureLabels = featureLevelLimitAt(mapRadius) > 0
    const internalFallbackAllowed = allowInwardFeatureLabels
      ? new Set(nonArcRanked.slice(0, MAX_INNER_FEATURE_LABELS).map((info) => info.segmentId))
      : new Set<string>()

    labelSegments.forEach((info) => {
      if (featureLabelFitsAtRadius(info, mapRadius)) {
        const occupied = occupancy.get(info.level * 2) ?? []
        occupied.push({ start: info.start, end: info.end })
        occupancy.set(info.level * 2, occupied)
        return
      }
      if (!internalFallbackAllowed.has(info.segmentId)) {
        if (
          allowOuterFeatureLabels &&
          (info.level === 0 || info.feature.prioritizeDisplay)
        ) {
          outerFeatureInfos.push(info)
        }
        return
      }
      const candidates = [
        { radialUnits: 0.5, key: info.level * 2 + 1, withLine: false },
        { radialUnits: 1, key: info.level * 2 + 2, withLine: true },
      ]

      for (const candidate of candidates) {
        const label = featureInnerLabelAtRadius(info, candidate.radialUnits, candidate.withLine, mapRadius)
        const occupied = occupancy.get(candidate.key) ?? []
        if (occupied.some((range) => rangesOverlap(label.labelStart, label.labelEnd, range.start, range.end))) continue
        occupied.push({ start: label.labelStart, end: label.labelEnd })
        occupancy.set(candidate.key, occupied)
        layouts.set(info.segmentId, label)
        return
      }

      if (
        allowOuterFeatureLabels &&
        (info.level === 0 || info.feature.prioritizeDisplay)
      ) {
        outerFeatureInfos.push(info)
      }
    })

    return { layouts, outerFeatureInfos, preferredLabelSegmentIds, gapLabelConnectors }
  }

  return {
    featureTrackGapFor,
    featureLevelLimitAt,
    featureRadiusAt,
    featureSpan,
    featureLabelFitsAtRadius,
    featureLabelArcAtRadius,
    featureNoColorLabelBackdropArc,
    featureInnerLabelAtRadius,
    circularRanges,
    rangesOverlap,
    featureSitesForOuterFeatures,
    externalFeatureCandidates,
    runStrictCircularLayout,
    calloutLayoutInput,
    routableCombinedCallouts,
    renderedFeaturesAtRadius,
    titleFitsInsideAtRadius,
    featureCalloutPlanAtRadius,
  }
}
