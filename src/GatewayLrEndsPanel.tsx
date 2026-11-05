import type {
  GatewayLrAssemblyDiagram,
  GatewayLrEndsDuplex,
  ResolvedGatewayDestination,
  ResolvedGatewayEntry,
} from './domain/gatewayBpCloning'
import {
  buildGatewayLrEndsDuplex,
} from './domain/gatewayBpCloning'

function lightenHex(hex: string, amount = 0.45): string {
  const raw = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex
  const channel = (index: number) => parseInt(raw.slice(index, index + 2), 16)
  const mix = (value: number) => Math.round(value + (255 - value) * amount)
  const r = mix(channel(0))
  const g = mix(channel(2))
  const b = mix(channel(4))
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function GatewayLrEndsDuplexView({ duplex }: { duplex: GatewayLrEndsDuplex }) {
  if (!duplex.ready) {
    return (
      <div className="gateway-lr-ends-panel is-empty">
        <span>{duplex.message}</span>
      </div>
    )
  }

  return (
    <div className="gateway-lr-ends-panel" aria-label="Cloning ends">
      <div
        className="gateway-lr-ends-duplex"
        style={{
          ['--gateway-lr-ends-color' as string]: duplex.color,
          ['--gateway-lr-ends-ink' as string]: duplex.inkColor,
        }}
      >
        <span className="gateway-lr-ends-site-label is-left">{duplex.leftLabel}</span>
        <div className="gateway-lr-ends-strands">
          <div className="gateway-lr-ends-strand" aria-hidden>
            {duplex.top.map((segment, index) => (
              <span
                key={`top-${index}-${segment.role}-${segment.text.length}`}
                className={`gateway-lr-ends-bases is-${segment.role}`}
              >
                {segment.text}
              </span>
            ))}
          </div>
          <div className="gateway-lr-ends-strand" aria-hidden>
            {duplex.bottom.map((segment, index) => (
              <span
                key={`bot-${index}-${segment.role}-${segment.text.length}`}
                className={`gateway-lr-ends-bases is-${segment.role}`}
              >
                {segment.text}
              </span>
            ))}
          </div>
          <div className="gateway-lr-ends-center-label">{duplex.centerLabel}</div>
        </div>
        <span className="gateway-lr-ends-site-label is-right">{duplex.rightLabel}</span>
      </div>
    </div>
  )
}

function siteArrow(name: string, side: 'left' | 'right') {
  return side === 'left' ? `${name} →` : `← ${name}`
}

/** Rounded rectangle with an open top gap (SnapGene-style vector backbone). */
function openTopRoundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  gapLeft: number,
  gapRight: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  const left = Math.max(x + r, Math.min(gapLeft, x + width - r))
  const right = Math.min(x + width - r, Math.max(gapRight, x + r))
  // Draw clockwise from the right lip around to the left lip, leaving the top gap open.
  return [
    `M ${right} ${y}`,
    `L ${x + width - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `L ${x + width} ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `L ${x + r} ${y + height}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `L ${left} ${y}`,
  ].join(' ')
}

export function GatewayLrAssemblyDiagramView({
  model,
  compact = false,
}: {
  model: GatewayLrAssemblyDiagram
  compact?: boolean
}) {
  if (!model.ready) {
    return (
      <div className={`gateway-lr-assembly-embed${compact ? ' is-compact' : ''} is-empty`}>
        <span>{model.message}</span>
      </div>
    )
  }

  const fragmentCount = Math.max(1, model.fragments.length)
  // Thin strips whose ends overlap horizontally at att junctions (SnapGene-style).
  const laneWidth = 92
  const overlap = 30
  const step = laneWidth - overlap
  const contentWidth = laneWidth + Math.max(0, fragmentCount - 1) * step
  const leftPad = 48
  const bridge = 64
  const productInnerW = Math.max(180, contentWidth + 24)
  const rightPad = 32
  const stroke = 2.5
  const barH = 7
  const corner = 14
  // Leave room for lower-row att labels between the staggered strips.
  const labelClear = 18
  const xClear = 24
  const rowGap = barH + labelClear + xClear

  const reactantBoxX = leftPad
  const reactantW = contentWidth + 40
  const productBoxX = leftPad + reactantW + bridge
  const productW = productInnerW + 40
  const svgWidth = productBoxX + productW + rightPad

  const insertTop = 28
  const upperY = insertTop
  const lowerY = insertTop + rowGap
  const upperStripBottom = upperY + barH
  // Lower att labels sit above the lower strip; Xs go in the open band under the upper strips.
  const lowerAttTop = lowerY - labelClear
  const xBandY = (upperStripBottom + lowerAttTop) / 2
  const boxY = lowerY + barH + 22
  const boxH = 44
  const svgHeight = boxY + boxH + 14

  const gapLeft = reactantBoxX + 24
  const gapRight = reactantBoxX + reactantW - 24
  const productGapLeft = productBoxX + 24
  const productGapRight = productBoxX + productW - 24

  const fragOriginX = reactantBoxX + (reactantW - contentWidth) / 2
  const fragmentLeft = (index: number) => fragOriginX + index * step
  const fragmentRight = (index: number) => fragmentLeft(index) + laneWidth
  const fragJunctionX = (index: number) => fragmentRight(index) - overlap / 2

  const junctionXs = [
    fragmentLeft(0),
    ...Array.from({ length: Math.max(0, fragmentCount - 1) }, (_, index) => fragJunctionX(index)),
    fragmentRight(fragmentCount - 1),
  ]

  const markerId = compact ? 'gateway-lr-assembly-arrow-compact' : 'gateway-lr-assembly-arrow'
  const xMark = 5

  return (
    <div
      className={`gateway-lr-assembly-embed${compact ? ' is-compact' : ''}`}
      aria-label="Fragment insertion"
    >
      <svg
        className="gateway-lr-assembly-svg"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label={model.message}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--vg-diagram-surface)" />
          </marker>
        </defs>

        {model.fragments.map((fragment, index) => {
          const x = fragmentLeft(index)
          const y = fragment.row === 0 ? lowerY : upperY
          const fill = fragment.matched ? fragment.color : lightenHex(fragment.color, 0.55)
          // Keep label baselines just above each strip so Xs fit between upper bars and lower labels.
          const labelY = y - 5
          return (
            <g key={`frag-${fragment.index}`}>
              <rect x={x} y={y} width={laneWidth} height={barH} rx={1} fill={fill} />
              <text x={x} y={labelY} className="gateway-lr-assembly-label" textAnchor="start">
                {siteArrow(fragment.leftName, 'left')}
              </text>
              <text
                x={x + laneWidth}
                y={labelY}
                className="gateway-lr-assembly-label"
                textAnchor="end"
              >
                {siteArrow(fragment.rightName, 'right')}
              </text>
            </g>
          )
        })}

        {model.junctions.map((junction, index) => {
          if (!junction.compatible) return null
          const x = junctionXs[index] ?? fragOriginX
          const isEndJunction = index === 0 || index === model.junctions.length - 1
          let y = xBandY
          if (isEndJunction) {
            const stripIndex = index === 0 ? 0 : fragmentCount - 1
            const stripY =
              model.fragments[stripIndex]?.row === 0 ? lowerY : upperY
            const stripBottom = stripY + barH
            y = (stripBottom + boxY) / 2
          }
          return (
            <path
              key={`xo-${index}-${junction.leftName}-${junction.rightName}`}
              d={`M ${x - xMark} ${y - xMark} L ${x + xMark} ${y + xMark} M ${x + xMark} ${y - xMark} L ${x - xMark} ${y + xMark}`}
              stroke="var(--vg-diagram-line)"
              strokeWidth={1.25}
              strokeLinecap="round"
            />
          )
        })}

        <path
          d={openTopRoundedRectPath(
            reactantBoxX,
            boxY,
            reactantW,
            boxH,
            corner,
            gapLeft,
            gapRight,
          )}
          fill="none"
          stroke={model.destination.color}
          strokeWidth={stroke}
          strokeLinejoin="round"
          strokeLinecap="butt"
        />

        <text
          x={gapLeft - 6}
          y={boxY - 6}
          className="gateway-lr-assembly-label"
          textAnchor="end"
        >
          {siteArrow(model.destination.leftName, 'left')}
        </text>
        <text
          x={gapRight + 6}
          y={boxY - 6}
          className="gateway-lr-assembly-label"
          textAnchor="start"
        >
          {siteArrow(model.destination.rightName, 'right')}
        </text>

        <path
          d={`M ${reactantBoxX + reactantW + 14} ${boxY + boxH / 2}
              L ${productBoxX - 14} ${boxY + boxH / 2}`}
          stroke="var(--vg-diagram-line)"
          strokeWidth={1.5}
          markerEnd={`url(#${markerId})`}
        />

        <path
          d={openTopRoundedRectPath(
            productBoxX,
            boxY,
            productW,
            boxH,
            corner,
            productGapLeft,
            productGapRight,
          )}
          fill="none"
          stroke={model.destination.color}
          strokeWidth={stroke}
          strokeLinejoin="round"
          strokeLinecap="butt"
        />

        {model.fragments.map((fragment, index) => {
          const width = (productGapRight - productGapLeft) / fragmentCount
          const x = productGapLeft + index * width
          const y = boxY - barH / 2
          const fill = fragment.matched ? fragment.color : lightenHex(fragment.color, 0.55)
          return (
            <g key={`prod-${fragment.index}`}>
              <rect x={x} y={y} width={width} height={barH} fill={fill} />
            </g>
          )
        })}

        {model.productSiteLabels.map((label, index) => {
          const junctionCount = model.productSiteLabels.length
          if (junctionCount < 1) return null
          const width = (productGapRight - productGapLeft) / fragmentCount
          const x =
            index === junctionCount - 1
              ? productGapRight
              : productGapLeft + index * width
          const barY = boxY - barH / 2
          const side = index === junctionCount - 1 ? 'right' : 'left'
          const arrow = side === 'left' ? '→' : '←'
          return (
            <g key={`prod-att-${label}-${index}`}>
              <text
                x={x}
                y={barY - 18}
                className="gateway-lr-assembly-label"
                textAnchor="middle"
              >
                {arrow}
              </text>
              <text
                x={x}
                y={barY - 5}
                className="gateway-lr-assembly-label"
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
      {!compact && <div className="gateway-lr-assembly-caption">{model.message}</div>}
    </div>
  )
}

export function GatewayLrEndsPanel({
  activePart,
  entries,
  destination,
}: {
  activePart: string
  entries: ResolvedGatewayEntry[]
  destination: ResolvedGatewayDestination
}) {
  // Product insertion diagram lives in the schema Product card.
  if (activePart === 'product') return null

  if (activePart === 'destination') {
    return <GatewayLrEndsDuplexView duplex={buildGatewayLrEndsDuplex(destination)} />
  }

  const entryMatch = /^entry-(\d+)$/.exec(activePart)
  if (entryMatch) {
    const index = Number(entryMatch[1])
    const entry = entries[index]
    if (!entry) {
      return (
        <div className="gateway-lr-ends-panel is-empty">
          <span>Choose an Entry Clone.</span>
        </div>
      )
    }
    return <GatewayLrEndsDuplexView duplex={buildGatewayLrEndsDuplex(entry)} />
  }

  return null
}
