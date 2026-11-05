import { useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { enzymeLabelTextClassName, type EnzymeLabelDisplayStyle } from '../../domain/enzymePreferences'
import { enzymeNamesFromLabel, resolveEnzymeNameFromLabelClick } from '../../domain/enzymeLabel'
import { featureNoColorStripeThickness } from '../../domain/featureAppearance'
import { measureTextWidthPx, SELECTED_PRIMER_MAP_COLOR } from './mapPrimitives'
import { mapCalloutLabelParts, mapCalloutLabelWidth, type MapCalloutKind } from './mapCalloutLabel'
import type { StrandPairSelection } from '../../domain/sequence'

/** Draws strand-specific cut endpoints across the linear map tracks. */
export function LinearSelectionCutBoundaries({ selection, sequenceX, y1, y2 }: {
  selection: StrandPairSelection | null | undefined
  sequenceX: (position: number) => number
  y1: number
  y2: number
}) {
  if (!selection) return null
  const positions = new Set([
    selection.forward.start,
    selection.reverse.start,
    selection.forward.end,
    selection.reverse.end,
  ])
  return <>
    {[...positions].map((position) => (
      <line
        key={`selection-cut-${position}`}
        className="linear-selection-cut-boundary"
        x1={sequenceX(position)}
        x2={sequenceX(position)}
        y1={y1}
        y2={y2}
      />
    ))}
  </>
}

export function MapCalloutLabelContent({ label, kind, anchor }: { label: string; kind: MapCalloutKind; anchor: string }) {
  const { name, coordinate, coordinateFirst } = mapCalloutLabelParts(label, kind, anchor)
  if (!coordinate) return <>{name}</>
  const coordinateSpan = <tspan fontWeight={400}>{coordinate}</tspan>
  return coordinateFirst
    ? <>{coordinateSpan}{'\u00a0\u00a0\u00a0'}{name}</>
    : <>{name}{'\u00a0\u00a0\u00a0'}{coordinateSpan}</>
}

/**
 * Up-pointing cleavage arrow path centered at the origin (tip at negative Y).
 * Drawn with a white halo behind for the knockout look across the feature body.
 */
function cleavageArrowPath(halfHeight = 11, headWidth = 4.5, headHeight = 5, shaftWidth = 1.6) {
  const tipY = -halfHeight
  const headBaseY = tipY + headHeight
  const shaftBottom = halfHeight
  const hw = shaftWidth / 2
  return `M 0 ${tipY} L ${headWidth} ${headBaseY} L ${hw} ${headBaseY} L ${hw} ${shaftBottom} L ${-hw} ${shaftBottom} L ${-hw} ${headBaseY} L ${-headWidth} ${headBaseY} Z`
}

const CLEAVAGE_ARROW_PATH = cleavageArrowPath()

export function CleavageArrowMark({
  transform,
  title,
}: {
  transform: string
  title?: string
}) {
  return (
    <g className="cleavage-arrow-mark" transform={transform} pointerEvents="none">
      {title ? <title>{title}</title> : null}
      <path d={CLEAVAGE_ARROW_PATH} className="cleavage-arrow-halo" />
      <path d={CLEAVAGE_ARROW_PATH} className="cleavage-arrow" />
    </g>
  )
}

/** Open-ended noColor band: vertical caps + centered black mid-stripe (no horizontal borders). */
export function LinearNoColorFeatureBody({
  x,
  y,
  width,
  height,
  selected,
  arrow = 'none',
}: {
  x: number
  y: number
  width: number
  height: number
  selected?: boolean
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
}) {
  const w = Math.max(1, width)
  const stripeH = featureNoColorStripeThickness(height)
  const stripeY = y + (height - stripeH) / 2
  const arrowPx = Math.min(10, w / 3)
  const leftArrow = arrow === 'reverse' || arrow === 'both'
  const rightArrow = arrow === 'forward' || arrow === 'both'
  const capLeft = x + (leftArrow ? arrowPx : 0)
  const capRight = x + w - (rightArrow ? arrowPx : 0)
  return (
    <g className={`feature-nocolor linear-feature-nocolor${selected ? ' is-selected' : ''}`}>
      <rect x={x} y={y} width={w} height={height} className="feature-nocolor-hit" />
      <line x1={capLeft} y1={y} x2={capLeft} y2={y + height} className="feature-nocolor-cap" />
      <line x1={capRight} y1={y} x2={capRight} y2={y + height} className="feature-nocolor-cap" />
      <rect x={x} y={stripeY} width={w} height={stripeH} className="feature-nocolor-stripe" />
      {rightArrow && <polygon points={`${x + w},${y + height / 2} ${capRight},${y} ${capRight},${y + height}`} className="feature-nocolor-stripe" />}
      {leftArrow && <polygon points={`${x},${y + height / 2} ${capLeft},${y + height} ${capLeft},${y}`} className="feature-nocolor-stripe" />}
    </g>
  )
}

/** Dark badge + white text used for selected primers and cloning cut enzymes. */
export function SelectedMapCalloutLabel({
  label,
  x,
  y,
  textAnchor,
  fontSize,
  fontWeight,
  textClassName,
  mapCalloutKind,
}: {
  label: string
  x: number
  y: number
  textAnchor: 'start' | 'end' | 'middle'
  fontSize: number
  fontWeight: number
  textClassName?: string
  mapCalloutKind?: MapCalloutKind
}) {
  const font = `${mapCalloutKind ? Math.max(400, fontWeight) : fontWeight} ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`
  const textWidth = mapCalloutKind
    ? mapCalloutLabelWidth(label, mapCalloutKind, (text) => measureTextWidthPx(text, font, 7))
    : measureTextWidthPx(label, font, 7)
  const padX = 7
  const padY = 4
  const height = fontSize + padY * 2
  const width = textWidth + padX * 2
  const left =
    textAnchor === 'end' ? x - textWidth - padX : textAnchor === 'middle' ? x - width / 2 : x - padX
  const top = y - height / 2
  return (
    <>
      <rect
        className="primer-callout-selected-badge"
        x={left}
        y={top}
        width={width}
        height={height}
        rx={6}
        ry={6}
        fill={SELECTED_PRIMER_MAP_COLOR}
      />
      <text
        x={x}
        y={y}
        textAnchor={textAnchor}
        dominantBaseline={mapCalloutKind ? 'alphabetic' : 'middle'}
        dy={mapCalloutKind ? '0.35em' : undefined}
        className={textClassName}
        style={{ fontSize, fontWeight, fill: 'var(--app-selection-text)' }}
      >
        {mapCalloutKind ? <MapCalloutLabelContent label={label} kind={mapCalloutKind} anchor={textAnchor} /> : label}
      </text>
    </>
  )
}

export function SelectedPrimerMapLabel(props: {
  label: string
  x: number
  y: number
  textAnchor: 'start' | 'end' | 'middle'
  fontSize: number
  fontWeight: number
}) {
  return <SelectedMapCalloutLabel {...props} mapCalloutKind="primer" />
}

export function EnzymeCalloutLabelText({
  label,
  x,
  y,
  textAnchor,
  dominantBaseline = 'middle',
  labelStyle,
  fontSize,
  fontWeight,
  onEnzymeInfo,
  mapCalloutKind,
}: {
  label: string
  x: number
  y: number
  textAnchor: 'start' | 'middle' | 'end' | 'inherit'
  dominantBaseline?: 'middle' | 'auto' | 'inherit' | 'hanging' | 'alphabetic' | 'ideographic' | 'mathematical' | 'use-script' | 'no-change' | 'reset-size'
  labelStyle?: EnzymeLabelDisplayStyle
  fontSize?: number
  fontWeight?: number
  onEnzymeInfo: (enzymeName: string) => void
  mapCalloutKind?: 'enzyme'
}) {
  const displayedLabel = mapCalloutKind ? mapCalloutLabelParts(label, mapCalloutKind, textAnchor).text : label
  const textRef = useRef<SVGTextElement>(null)
  const [hitPad, setHitPad] = useState({ x: 0, y: 0, width: 0, height: 0 })

  useLayoutEffect(() => {
    const text = textRef.current
    if (!text) return
    try {
      const bbox = text.getBBox()
      setHitPad({
        x: bbox.x - 4,
        y: bbox.y - 3,
        width: bbox.width + 8,
        height: bbox.height + 6,
      })
    } catch {
      // Text not yet measurable in the DOM.
    }
  }, [label, x, y, textAnchor, dominantBaseline, labelStyle, fontSize, fontWeight])

  function openEnzymeInfo(event: MouseEvent<SVGGElement>) {
    event.stopPropagation()
    event.preventDefault()

    const text = textRef.current
    if (!text) {
      onEnzymeInfo(enzymeNamesFromLabel(displayedLabel)[0] ?? displayedLabel.trim())
      return
    }

    onEnzymeInfo(resolveEnzymeNameFromLabelClick(text, displayedLabel, event.clientX, event.clientY))
  }

  return (
    <g className="enzyme-callout-label-hit" onDoubleClick={openEnzymeInfo}>
      {hitPad.width > 0 && (
        <rect
          x={hitPad.x}
          y={hitPad.y}
          width={hitPad.width}
          height={hitPad.height}
          fill="transparent"
          pointerEvents="all"
        />
      )}
      <text
        ref={textRef}
        x={x}
        y={y}
        textAnchor={textAnchor}
        dominantBaseline={mapCalloutKind ? 'alphabetic' : dominantBaseline}
        dy={mapCalloutKind ? '0.35em' : undefined}
        className={labelStyle ? enzymeLabelTextClassName(labelStyle) : 'enzyme-callout-name'}
        style={{
          ...(fontSize != null ? { fontSize } : null),
          ...(fontWeight != null ? { fontWeight } : null),
        }}
      >
        {mapCalloutKind ? <MapCalloutLabelContent label={label} kind={mapCalloutKind} anchor={textAnchor} /> : label}
      </text>
    </g>
  )
}
