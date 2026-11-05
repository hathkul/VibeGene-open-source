import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { stableCircularScrollportHeight } from '../../domain/circularMapResponsive'
import type { EnzymePreferences } from '../../domain/enzymePreferences'
import type { LeaderBendAngleStats } from '../../domain/mapLayout'
import type { PrimerBinding, RestrictionSite, SequenceFeature, SequenceRecord } from '../../domain/types'
import type { StrandPairSelection } from '../../domain/sequence'
import type { RestrictionSiteList, SelectionRange } from './mapPrimitives'
import type { CircularMapDisplaySettings } from './PlasmidMap'
import { PlasmidMap } from './PlasmidMap'

type StageSize = { width: number; height: number; mapSize: number; minLocked: boolean }
type MapLayoutMode = 'standard' | 'packedFallback' | 'arcOverflow'
const MIN_ROUTING_MAP_SIZE = 324
let lastCircularStageSize: StageSize | null = null

export function CircularMapStage<T extends CircularMapDisplaySettings>({
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
  onDisplaySettingsChange,
  onSaveVisualSettings,
  onRevertVisualSettings,
  onRenameRecord,
  onEditMapLabel,
}: {
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
  onDisplaySettingsChange?: (updater: (current: T) => T) => void
  onSaveVisualSettings?: () => void
  onRevertVisualSettings?: () => void
  onRenameRecord?: (name: string) => void
  onEditMapLabel?: (label: string) => void
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageSize, setStageSize] = useState<StageSize>(() => lastCircularStageSize ?? { width: 520, height: 520, mapSize: 520, minLocked: true })
  const [leaderAngleStats, setLeaderAngleStats] = useState<LeaderBendAngleStats | null>(null)
  const [mapLayoutMode, setMapLayoutMode] = useState<MapLayoutMode>('standard')
  const stageSizeRef = useRef(stageSize)
  const visualControlsOpen = displaySettings.circularVisual?.panelOpen === true
  const manualLabelPlacement = displaySettings.circularVisual?.manualLabelPlacement === true
  const outsideLabelFontSizePx = displaySettings.circularVisual?.outsideLabelFontSizePx ?? 12
  const outsideLabelLeaderGapPx = displaySettings.circularVisual?.outsideLabelLeaderGapPx ?? 6
  const enzymeFontWeight = displaySettings.circularVisual?.enzymeFontWeight ?? 500
  const uniqueEnzymeFontWeight = displaySettings.circularVisual?.uniqueEnzymeFontWeight ?? 800
  const primerFontWeight = displaySettings.circularVisual?.primerFontWeight ?? 600
  const featureInlineFontSizePx = displaySettings.circularVisual?.featureInlineFontSizePx ?? 12
  const featureInlineFontWeight = displaySettings.circularVisual?.featureInlineFontWeight ?? 400
  const ringGap = displaySettings.labelRouting.ellipticRingGap ?? 0
  const labelCurveShape = displaySettings.labelRouting.labelCurveShape ?? 'arcs'
  const softRingFloorDiameterPercent = Math.round(
    (displaySettings.labelRouting.softRingFloorDiameterRatio ?? 0.5) * 100,
  )
  const autoRingScalePercent = Math.round(
    (displaySettings.labelRouting.autoRingScaleRatio ?? 1) * 100,
  )
  const sideBudgetSetting = displaySettings.labelRouting.ellipticSideBudget
  const horizontalGapSetting = displaySettings.labelRouting.ellipticHorizontalGapPx
  const verticalGapSetting = displaySettings.labelRouting.ellipticVerticalGapPx
  const arcHorizontalGapSetting = displaySettings.labelRouting.arcHorizontalGapPx ?? null
  const arcHalvesLinked = displaySettings.labelRouting.arcHalvesLinked === true
  const arcUpperVerticalGapSetting = displaySettings.labelRouting.arcUpperVerticalGapPx ?? null
  const arcLowerVerticalGapSetting = displaySettings.labelRouting.arcLowerVerticalGapPx ?? null
  const arcUpperTipAngleDegrees = displaySettings.labelRouting.arcUpperTipAngleDegrees ?? null
  const arcLowerTipAngleDegrees = displaySettings.labelRouting.arcLowerTipAngleDegrees ?? null
  const arcCompactOverflowLabels =
    displaySettings.labelRouting.arcCompactOverflowLabels === true
  const raySlideEnabled = displaySettings.labelRouting.ellipticRaySlideEnabled === true
  const raySlideClearancePx = displaySettings.labelRouting.ellipticRaySlideClearancePx ?? 4
  const radialImplodeEnabled = displaySettings.labelRouting.ellipticRadialImplodeEnabled === true
  const radialImplodeClearancePx = displaySettings.labelRouting.ellipticRadialImplodeClearancePx ?? 4
  const radialImplodeMinRingDistancePx = displaySettings.labelRouting.ellipticRadialImplodeMinRingDistancePx ?? 24
  const balanceRingEnabled = displaySettings.labelRouting.ellipticBalanceRing !== false
  const autoSideBudgetEstimate = 64

  function patchLabelRouting(patch: Partial<CircularMapDisplaySettings['labelRouting']>) {
    onDisplaySettingsChange?.((current) => ({
      ...current,
      labelRouting: {
        ...current.labelRouting,
        ...patch,
      },
    }))
  }

  function patchCircularVisual(patch: Partial<CircularMapDisplaySettings['circularVisual']>) {
    onDisplaySettingsChange?.((current) => ({
      ...current,
      circularVisual: {
        ...current.circularVisual,
        ...patch,
      },
    }))
  }

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    let frameId: number | null = null
    let pendingTarget = stageSizeRef.current
    let settleTimer: number | null = null

    function normalizeTarget(width: number, height: number) {
      // Floor snaps only — never round up past the scrollport, or a V scrollbar
      // immediately forces a matching H scrollbar ("scrollbars for scrollbars").
      const normalizedWidth = Math.max(320, Math.floor(width))
      const normalizedHeight = Math.max(320, Math.floor(height))
      const rawMapSize = Math.max(320, Math.floor(Math.min(normalizedWidth, normalizedHeight)))
      const shortestViewportSide = Math.min(normalizedWidth, normalizedHeight)
      const minLocked = shortestViewportSide < MIN_ROUTING_MAP_SIZE
      return {
        width: Math.floor(normalizedWidth / 6) * 6,
        height: Math.floor(normalizedHeight / 6) * 6,
        mapSize: Math.max(MIN_ROUTING_MAP_SIZE, Math.floor(rawMapSize / 6) * 6),
        minLocked,
      }
    }

    function applySize(nextSize: typeof stageSizeRef.current) {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        stageSizeRef.current = nextSize
        lastCircularStageSize = nextSize
        setStageSize((currentSize) =>
          currentSize.width === nextSize.width &&
          currentSize.height === nextSize.height &&
          currentSize.mapSize === nextSize.mapSize &&
          currentSize.minLocked === nextSize.minLocked
            ? currentSize
            : nextSize,
        )
      })
    }

    function scheduleApply() {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer)
        settleTimer = null
      }
      settleTimer = window.setTimeout(() => {
        applySize(pendingTarget)
        settleTimer = null
      }, 110)
    }

    function measuredStageHeight() {
      // Dense compact maps can alternate between needing a horizontal scrollbar and not
      // needing one. Reserve its thickness there; leave spacious map sizing unchanged.
      if (stage!.clientHeight >= 800) return stage!.clientHeight
      const style = window.getComputedStyle(stage!)
      const border = (value: string) => Number.parseFloat(value) || 0
      return stableCircularScrollportHeight({
        clientHeight: stage!.clientHeight, offsetHeight: stage!.offsetHeight,
        clientWidth: stage!.clientWidth, offsetWidth: stage!.offsetWidth,
        horizontalBorders: border(style.borderLeftWidth) + border(style.borderRightWidth),
        verticalBorders: border(style.borderTopWidth) + border(style.borderBottomWidth),
      })
    }

    const observer = new ResizeObserver(() => {
      // Measure the scroll host (with stable scrollbar-gutter), not the parent.
      const viewWidth = stage.clientWidth
      const viewHeight = measuredStageHeight()
      if (viewWidth < 32 || viewHeight < 32) return
      const targetSize = normalizeTarget(viewWidth, viewHeight)
      if (
        targetSize.width === pendingTarget.width &&
        targetSize.height === pendingTarget.height &&
        targetSize.mapSize === pendingTarget.mapSize &&
        targetSize.minLocked === pendingTarget.minLocked
      )
        return
      pendingTarget = targetSize
      scheduleApply()
    })

    if (stage.clientWidth >= 32 && stage.clientHeight >= 32) {
      pendingTarget = normalizeTarget(stage.clientWidth, measuredStageHeight())
      applySize(pendingTarget)
    } else if (lastCircularStageSize) {
      pendingTarget = lastCircularStageSize
      applySize(lastCircularStageSize)
    }

    observer.observe(stage)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    if (mapLayoutMode === 'arcOverflow') return
    const frame = window.requestAnimationFrame(() => {
      const maxLeft = stage.scrollWidth - stage.clientWidth
      const maxTop = stage.scrollHeight - stage.clientHeight
      if (maxLeft > 0) stage.scrollLeft = maxLeft / 2
      if (maxTop > 0) stage.scrollTop = maxTop / 2
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mapLayoutMode, stageSize.mapSize, stageSize.minLocked, stageSize.width, stageSize.height])

  return (
    <div className={`map-stage ${stageSize.minLocked ? 'is-min-locked' : ''}`} ref={stageRef}>
      {visualControlsOpen && onDisplaySettingsChange ? (
        <div className="elliptic-ring-gap-control circular-visual-controls" onPointerDown={(event) => event.stopPropagation()}>
          <label>
            <span className="elliptic-ring-gap-label">
              Soft ring floor {softRingFloorDiameterPercent}% · minimum ring diameter
            </span>
            <input
              type="range"
              min={30}
              max={90}
              step={2}
              value={softRingFloorDiameterPercent}
              aria-label="Preferred minimum ring diameter as a percentage of the circular map viewport"
              onChange={(event) =>
                patchLabelRouting({
                  softRingFloorDiameterRatio: Number(event.target.value) / 100,
                })
              }
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">
              Auto ring size {autoRingScalePercent}% · ceiling relative to automatic
            </span>
            <input
              type="range"
              min={40}
              max={100}
              step={5}
              value={autoRingScalePercent}
              aria-label="Maximum ring size as a percentage of the automatically calculated size"
              onChange={(event) =>
                patchLabelRouting({
                  autoRingScaleRatio: Number(event.target.value) / 100,
                })
              }
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">
              Ring gap {ringGap}px · room outside ring before ray-slide
            </span>
            <input
              type="range"
              min={0}
              max={160}
              step={4}
              value={ringGap}
              aria-label="Clearance between ring and label oval; also limits how far ray-slide can move inward"
              onChange={(event) => patchLabelRouting({ ellipticRingGap: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">
              Side reserve{' '}
              {sideBudgetSetting === null
                ? `auto (~${autoSideBudgetEstimate}px)`
                : `${sideBudgetSetting}px`}{' '}
              · higher → smaller ring (set before ray-slide)
            </span>
            <input
              type="range"
              min={0}
              max={200}
              step={4}
              value={sideBudgetSetting === null ? 200 : sideBudgetSetting}
              aria-label="Horizontal pixels reserved for side labels when sizing the ring; higher shrinks the ring; max is auto"
              onChange={(event) => {
                const next = Number(event.target.value)
                patchLabelRouting({ ellipticSideBudget: next >= 200 ? null : next })
              }}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Label placement curve</span>
            <select
              className="elliptic-curve-shape-select"
              value={labelCurveShape}
              aria-label="Outside label placement curve"
              onChange={(event) =>
                patchLabelRouting({ labelCurveShape: event.target.value === 'arcs' ? 'arcs' : 'ellipse' })
              }
            >
              <option value="ellipse">Ellipse</option>
              <option value="arcs">Two arcs</option>
            </select>
          </label>
          {labelCurveShape === 'ellipse' ? (
            <>
              <label>
                <span className="elliptic-ring-gap-label">
                  Oval horizontal gap {horizontalGapSetting === null ? 'Auto' : `${horizontalGapSetting}px`}
                  {' '}· controls ellipse width only
                </span>
                <input
                  type="range"
                  min={16}
                  max={256}
                  step={8}
                  value={horizontalGapSetting === null ? 256 : horizontalGapSetting}
                  aria-label="Horizontal distance from the ring to the label ellipse; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    patchLabelRouting({ ellipticHorizontalGapPx: next >= 256 ? null : next })
                  }}
                />
              </label>
              <label>
                <span className="elliptic-ring-gap-label">
                  Oval vertical gap {verticalGapSetting === null ? 'Auto' : `${verticalGapSetting}px`}
                  {' '}· controls ellipse height only
                </span>
                <input
                  type="range"
                  min={16}
                  max={416}
                  step={8}
                  value={verticalGapSetting === null ? 416 : verticalGapSetting}
                  aria-label="Vertical distance from the ring to the label ellipse; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    patchLabelRouting({ ellipticVerticalGapPx: next >= 416 ? null : next })
                  }}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                <span className="elliptic-ring-gap-label">
                  Arc equator gap {arcHorizontalGapSetting === null ? 'Auto' : `${arcHorizontalGapSetting}px`}
                  {' '}· 3h / 9h width
                </span>
                <input
                  type="range"
                  min={16}
                  max={256}
                  step={8}
                  value={arcHorizontalGapSetting === null ? 256 : arcHorizontalGapSetting}
                  aria-label="Horizontal distance from the ring to the two-arc curve; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    patchLabelRouting({ arcHorizontalGapPx: next >= 256 ? null : next })
                  }}
                />
              </label>
              <label className="elliptic-ring-gap-check">
                <input
                  type="checkbox"
                  checked={arcHalvesLinked}
                  aria-label="Link upper and lower arc controls"
                  onChange={(event) =>
                    patchLabelRouting(
                      event.target.checked
                        ? {
                            arcHalvesLinked: true,
                            arcLowerVerticalGapPx: arcUpperVerticalGapSetting,
                            arcLowerTipAngleDegrees: arcUpperTipAngleDegrees,
                          }
                        : { arcHalvesLinked: false },
                    )
                  }
                />
                <span>Link upper/lower arc controls</span>
              </label>
              <label className="elliptic-ring-gap-check">
                <input
                  type="checkbox"
                  checked={arcCompactOverflowLabels}
                  aria-label="Keep labels closer to the map in arc overflow mode without reducing the minimum leader bend angle"
                  onChange={(event) =>
                    patchLabelRouting({ arcCompactOverflowLabels: event.target.checked })
                  }
                />
                <span>Compact overflow labels toward map</span>
              </label>
              <label>
                <span className="elliptic-ring-gap-label">
                  Upper polar gap{' '}
                  {arcUpperVerticalGapSetting === null ? 'Auto' : `${arcUpperVerticalGapSetting}px`}
                  {' '}· minimum 12h tip distance
                </span>
                <input
                  type="range"
                  min={16}
                  max={416}
                  step={8}
                  value={arcUpperVerticalGapSetting === null ? 416 : arcUpperVerticalGapSetting}
                  aria-label="Minimum vertical distance from the ring to the upper pointed arc tip; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    const value = next >= 416 ? null : next
                    patchLabelRouting({
                      arcUpperVerticalGapPx: value,
                      ...(arcHalvesLinked ? { arcLowerVerticalGapPx: value } : {}),
                    })
                  }}
                />
              </label>
              <label>
                <span className="elliptic-ring-gap-label">
                  Upper maximum tip angle{' '}
                  {arcUpperTipAngleDegrees === null ? 'Auto' : `${arcUpperTipAngleDegrees}°`}
                  {' '}· density may sharpen it
                </span>
                <input
                  type="range"
                  min={70}
                  max={180}
                  step={5}
                  value={arcUpperTipAngleDegrees ?? 180}
                  aria-label="Bluntest allowed angle where the label arcs meet at the upper pole; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    const value = next >= 180 ? null : next
                    patchLabelRouting({
                      arcUpperTipAngleDegrees: value,
                      ...(arcHalvesLinked ? { arcLowerTipAngleDegrees: value } : {}),
                    })
                  }}
                />
              </label>
              <label>
                <span className="elliptic-ring-gap-label">
                  Lower polar gap{' '}
                  {arcLowerVerticalGapSetting === null ? 'Auto' : `${arcLowerVerticalGapSetting}px`}
                  {' '}· minimum 6h tip distance
                </span>
                <input
                  type="range"
                  min={16}
                  max={416}
                  step={8}
                  value={arcLowerVerticalGapSetting === null ? 416 : arcLowerVerticalGapSetting}
                  disabled={arcHalvesLinked}
                  aria-label="Minimum vertical distance from the ring to the lower pointed arc tip; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    patchLabelRouting({ arcLowerVerticalGapPx: next >= 416 ? null : next })
                  }}
                />
              </label>
              <label>
                <span className="elliptic-ring-gap-label">
                  Lower maximum tip angle{' '}
                  {arcLowerTipAngleDegrees === null ? 'Auto' : `${arcLowerTipAngleDegrees}°`}
                  {' '}· density may sharpen it
                </span>
                <input
                  type="range"
                  min={70}
                  max={180}
                  step={5}
                  value={arcLowerTipAngleDegrees ?? 180}
                  disabled={arcHalvesLinked}
                  aria-label="Bluntest allowed angle where the label arcs meet at the lower pole; maximum is automatic"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    patchLabelRouting({ arcLowerTipAngleDegrees: next >= 180 ? null : next })
                  }}
                />
              </label>
            </>
          )}
          <div className="circular-leader-angle-stats" aria-label="Leader bend angle statistics">
            <span>Leader bend angles</span>
            {leaderAngleStats ? (
              <strong>
                min {leaderAngleStats.min.toFixed(1)}° · mean {leaderAngleStats.mean.toFixed(1)}° · max{' '}
                {leaderAngleStats.max.toFixed(1)}°
              </strong>
            ) : (
              <strong>—</strong>
            )}
            <small>{leaderAngleStats?.count ?? 0} leaders · 180° straight · below 90° acute</small>
          </div>
          {mapLayoutMode === 'arcOverflow' ? (
            <div className="circular-arc-overflow-status" role="status">
              Arc overflow layout · content exceeds viewport; scrolling enabled
            </div>
          ) : null}
          <label className="elliptic-ring-gap-check">
            <input
              type="checkbox"
              checked={raySlideEnabled}
              aria-label="Slide labels horizontally toward their site rays"
              onChange={(event) => patchLabelRouting({ ellipticRaySlideEnabled: event.target.checked })}
            />
            <span className="elliptic-ring-gap-label">Horizontal travel toward rays</span>
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Ray stop gap {raySlideClearancePx}px · horiz. to polar neighbor</span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={raySlideClearancePx}
              disabled={!raySlideEnabled}
              aria-label="Minimum horizontal gap to the more polar neighbor when sliding a label toward its ray"
              onChange={(event) => patchLabelRouting({ ellipticRaySlideClearancePx: Number(event.target.value) })}
            />
          </label>
          <label className="elliptic-ring-gap-check">
            <input
              type="checkbox"
              checked={radialImplodeEnabled}
              aria-label="Move labels radially toward the ring after horizontal travel"
              onChange={(event) => patchLabelRouting({ ellipticRadialImplodeEnabled: event.target.checked })}
            />
            <span className="elliptic-ring-gap-label">Radial implosion toward ring</span>
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Radial stop gap {radialImplodeClearancePx}px · labels / leaders</span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={radialImplodeClearancePx}
              disabled={!radialImplodeEnabled}
              aria-label="Minimum gap to other labels or leaders when imploding radially"
              onChange={(event) => patchLabelRouting({ ellipticRadialImplodeClearancePx: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">
              Implosion threshold {radialImplodeMinRingDistancePx}px · min distance to ring
            </span>
            <input
              type="range"
              min={0}
              max={120}
              step={4}
              value={radialImplodeMinRingDistancePx}
              disabled={!radialImplodeEnabled}
              aria-label="Minimum distance from the ring edge to a label box when imploding"
              onChange={(event) => patchLabelRouting({ ellipticRadialImplodeMinRingDistancePx: Number(event.target.value) })}
            />
          </label>
          <label className="elliptic-ring-gap-check">
            <input
              type="checkbox"
              checked={balanceRingEnabled}
              aria-label="Move the plasmid ring toward the emptiest pocket among outer labels"
              onChange={(event) => patchLabelRouting({ ellipticBalanceRing: event.target.checked })}
            />
            <span className="elliptic-ring-gap-label">Move ring to farthest point</span>
          </label>
          <div className="elliptic-ring-gap-divider" />
          <label>
            <span className="elliptic-ring-gap-label">Outside label size {outsideLabelFontSizePx}px</span>
            <input
              type="range"
              min={8}
              max={16}
              step={1}
              value={outsideLabelFontSizePx}
              aria-label="Font size for outside circular map labels"
              onChange={(event) => patchCircularVisual({ outsideLabelFontSizePx: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Enzyme / primer leader gap {outsideLabelLeaderGapPx}px</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={outsideLabelLeaderGapPx}
              aria-label="Horizontal gap between circular enzyme and primer labels and their leaders"
              onChange={(event) => patchCircularVisual({ outsideLabelLeaderGapPx: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Enzyme weight {enzymeFontWeight}</span>
            <input
              type="range"
              min={400}
              max={800}
              step={100}
              value={enzymeFontWeight}
              aria-label="Font weight for normal restriction enzyme labels"
              onChange={(event) => patchCircularVisual({ enzymeFontWeight: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Unique enzyme weight {uniqueEnzymeFontWeight}</span>
            <input
              type="range"
              min={400}
              max={800}
              step={100}
              value={uniqueEnzymeFontWeight}
              aria-label="Font weight for unique restriction enzyme labels"
              onChange={(event) => patchCircularVisual({ uniqueEnzymeFontWeight: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Primer weight {primerFontWeight}</span>
            <input
              type="range"
              min={400}
              max={800}
              step={100}
              value={primerFontWeight}
              aria-label="Font weight for primer labels"
              onChange={(event) => patchCircularVisual({ primerFontWeight: Number(event.target.value) })}
            />
          </label>
          <div className="elliptic-ring-gap-divider" />
          <label>
            <span className="elliptic-ring-gap-label">Feature name size {featureInlineFontSizePx}px</span>
            <input
              type="range"
              min={8}
              max={16}
              step={1}
              value={featureInlineFontSizePx}
              aria-label="Font size for in-line feature names on the map"
              onChange={(event) => patchCircularVisual({ featureInlineFontSizePx: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className="elliptic-ring-gap-label">Feature name weight {featureInlineFontWeight}</span>
            <input
              type="range"
              min={400}
              max={800}
              step={50}
              value={featureInlineFontWeight}
              aria-label="Font weight for in-line feature names on the map"
              onChange={(event) => patchCircularVisual({ featureInlineFontWeight: Number(event.target.value) })}
            />
          </label>
          <button
            type="button"
            className={`circular-manual-place-button ${manualLabelPlacement ? 'is-active' : ''}`}
            aria-pressed={manualLabelPlacement}
            onClick={() => patchCircularVisual({ manualLabelPlacement: !manualLabelPlacement })}
          >
            {manualLabelPlacement ? 'Done placing labels' : 'Manual label placement'}
          </button>
          {onSaveVisualSettings || onRevertVisualSettings ? (
            <div className="visual-controls-footer">
              {onRevertVisualSettings ? (
                <button type="button" className="visual-controls-revert" onClick={onRevertVisualSettings}>
                  Revert to defaults
                </button>
              ) : null}
              {onSaveVisualSettings ? (
                <button type="button" className="visual-controls-save" onClick={onSaveVisualSettings}>
                  Save
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <PlasmidMap
        mapSize={stageSize.mapSize}
        viewportWidth={stageSize.width}
        viewportHeight={stageSize.height}
        minLocked={stageSize.minLocked}
        record={record}
        restrictionSites={restrictionSites}
        primerBindings={primerBindings}
        annotationFeatures={annotationFeatures}
        displaySettings={displaySettings}
        enzymePreferences={enzymePreferences}
        selectedRange={selectedRange}
        selectionCutStrandPair={selectionCutStrandPair}
        selectedFeatureId={selectedFeatureId}
        selectedFeatureIds={selectedFeatureIds}
        selectedPrimerId={selectedPrimerId}
        selectedPrimerIds={selectedPrimerIds}
        selectedRestrictionSites={selectedRestrictionSites}
        svgIdScope={svgIdScope}
        onSelect={onSelect}
        onRangeSelect={onRangeSelect}
        onExtendToBase={onExtendToBase}
        onPrimerSelect={onPrimerSelect}
        onRestrictionSelect={onRestrictionSelect}
        onEnzymeInfo={onEnzymeInfo}
        onFeatureEdit={onFeatureEdit}
        onFeatureOpenAsProtein={onFeatureOpenAsProtein}
        onPrimerEdit={onPrimerEdit}
        onLeaderAngleStatsChange={setLeaderAngleStats}
        onLayoutModeChange={setMapLayoutMode}
        onRenameRecord={onRenameRecord}
        onEditMapLabel={onEditMapLabel}
      />
    </div>
  )
}
