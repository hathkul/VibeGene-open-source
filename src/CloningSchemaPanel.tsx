import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizeDnaEnds } from './domain/dnaEnds'
import {
  buildCloningProductDiagram,
  formatStickyEndPreview,
  type CloningAssemblyMode,
  type CloningDigestFragment,
  type CloningValidation,
  type PartialDigestWarning,
  type ResolvedCloningPart,
} from './domain/restrictionCloning'

type CloningSchemaPanelProps = {
  vector: ResolvedCloningPart | null
  inserts: ResolvedCloningPart[]
  insertOrder: number[]
  validation: CloningValidation
  activePart: 'vector' | `insert-${number}` | 'product'
  mode?: CloningAssemblyMode
  /** Both digest arcs of the vector, so the retained one can be picked here. */
  digestFragments?: CloningDigestFragment[]
  selectedFragmentId?: string | null
  sourceLength?: number
  sourceCircular?: boolean
  partialDigestWarnings?: PartialDigestWarning[]
  onSelectPart: (part: 'vector' | `insert-${number}` | 'product') => void
  onReorderInserts: (nextOrder: number[]) => void
  onSelectFragment?: (fragmentId: string) => void
}

function StickyEndBox({
  sequence,
  ends,
  side,
  accent,
  overhangSequence,
}: {
  sequence: string
  ends: ReturnType<typeof normalizeDnaEnds>
  side: 'upstream' | 'downstream'
  accent?: string
  overhangSequence?: string | null
}) {
  const preview = formatStickyEndPreview(sequence, ends, side, 6, overhangSequence)
  return (
    <div className="cloning-schema-sticky-end" style={accent ? { borderColor: accent } : undefined}>
      <pre className="cloning-schema-sticky-seq">{preview.top}</pre>
      <pre className="cloning-schema-sticky-seq">{preview.bottom}</pre>
    </div>
  )
}

function VectorSchema({
  part,
  selected,
  onSelect,
}: {
  part: ResolvedCloningPart | null
  selected: boolean
  onSelect: () => void
}) {
  if (!part) {
    return (
      <button
        type="button"
        className={`cloning-schema-part cloning-schema-vector is-empty${selected ? ' is-selected' : ''}`}
        onClick={onSelect}
      >
        <div className="cloning-schema-vector-card">
          <div className="cloning-schema-empty-graphic cloning-schema-vector-graphic">
            <svg viewBox="0 0 160 72" aria-hidden>
              <path
                d="M 28 58 A 52 52 0 1 1 132 58"
                fill="none"
                stroke="var(--vg-cloning-diagram-ink)"
                strokeWidth={10}
                strokeLinecap="round"
              />
              <line x1="28" y1="58" x2="28" y2="42" stroke="var(--vg-cloning-diagram-ink)" strokeWidth={1.5} />
              <line x1="132" y1="58" x2="132" y2="42" stroke="var(--vg-cloning-diagram-ink)" strokeWidth={1.5} />
            </svg>
          </div>
          <div className="cloning-schema-part-meta cloning-schema-vector-meta cloning-schema-empty-meta">
            <strong>Vector</strong>
            <span>Not configured</span>
          </div>
        </div>
      </button>
    )
  }
  const ends = normalizeDnaEnds(part.dnaEnds)
  const leftLabel = part.leftEnzymeLabel ?? part.leftEnzyme ?? '—'
  const rightLabel = part.rightEnzymeLabel ?? part.rightEnzyme ?? '—'
  return (
    <div className={`cloning-schema-part cloning-schema-vector${selected ? ' is-selected' : ''}`}>
      <button type="button" className="cloning-schema-part-hit" onClick={onSelect}>
        <div className="cloning-schema-vector-card">
          <div className="cloning-schema-vector-graphic">
            <svg viewBox="0 0 160 72" aria-hidden>
              <path
                d="M 28 58 A 52 52 0 1 1 132 58"
                fill="none"
                stroke="var(--vg-cloning-diagram-ink)"
                strokeWidth={10}
                strokeLinecap="round"
              />
              <line x1="28" y1="58" x2="28" y2="42" stroke="var(--vg-cloning-diagram-ink)" strokeWidth={1.5} />
              <line x1="132" y1="58" x2="132" y2="42" stroke="var(--vg-cloning-diagram-ink)" strokeWidth={1.5} />
            </svg>
            <span className="cloning-schema-arc-end is-left" title="Left (5′) end">
              {leftLabel}
            </span>
            <span className="cloning-schema-arc-end is-right" title="Right (3′) end">
              {rightLabel}
            </span>
          </div>
          <div className="cloning-schema-part-meta cloning-schema-vector-meta">
            <strong>Vector</strong>
            <span>{part.length.toLocaleString()} bp</span>
          </div>
        </div>
      </button>
      <div className="cloning-schema-sticky-row">
        <StickyEndBox
          sequence={part.sequence}
          ends={ends}
          side="upstream"
          overhangSequence={part.upstreamOverhang?.sequence}
        />
        <StickyEndBox
          sequence={part.sequence}
          ends={ends}
          side="downstream"
          overhangSequence={part.downstreamOverhang?.sequence}
        />
      </div>
    </div>
  )
}

function InsertSchema({
  part,
  index,
  orderIndex,
  selected,
  dragging,
  dropTarget,
  partLabel = 'Insert',
  onSelect,
  onPointerDragStart,
}: {
  part: ResolvedCloningPart | null
  index: number
  orderIndex: number
  selected: boolean
  dragging: boolean
  dropTarget: boolean
  partLabel?: string
  onSelect: () => void
  onPointerDragStart: (event: ReactPointerEvent<HTMLDivElement>, orderIndex: number) => void
}) {
  const ends = part ? normalizeDnaEnds(part.dnaEnds) : null

  function activate(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      className={`cloning-schema-part cloning-schema-insert${!part ? ' is-empty' : ''}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${dropTarget ? ' is-drop-target' : ''}`}
      data-cloning-order-index={part ? orderIndex : undefined}
      onPointerDown={part ? (event) => onPointerDragStart(event, orderIndex) : undefined}
      style={part ? { borderColor: part.color } : undefined}
    >
      <div
        className="cloning-schema-part-hit"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={activate}
      >
        {part ? (
          <div className="cloning-schema-insert-bar" style={{ background: part.color }} />
        ) : (
          <div className="cloning-schema-empty-graphic">
            <div className="cloning-schema-insert-bar" style={{ background: 'var(--vg-cloning-diagram-ink)' }} />
          </div>
        )}
        <div className={`cloning-schema-part-meta${!part ? ' cloning-schema-empty-meta' : ''}`}>
          <strong>
            {partLabel} {index + 1}
          </strong>
          <span>{part ? `${part.length.toLocaleString()} bp` : 'Not configured'}</span>
          {part && (
            <span className="cloning-schema-enzyme-pair">
              {part.leftEnzymeLabel ?? '—'} · {part.rightEnzymeLabel ?? '—'}
            </span>
          )}
          {part && <span className="cloning-schema-drag-hint">Drag to reorder</span>}
        </div>
      </div>
      {part && ends && (
        <div className="cloning-schema-sticky-row">
          <StickyEndBox
            sequence={part.sequence}
            ends={ends}
            side="upstream"
            accent={part.color}
            overhangSequence={part.upstreamOverhang?.sequence}
          />
          <StickyEndBox
            sequence={part.sequence}
            ends={ends}
            side="downstream"
            accent={part.color}
            overhangSequence={part.downstreamOverhang?.sequence}
          />
        </div>
      )}
    </div>
  )
}

function polar(cx: number, cy: number, radius: number, angleRad: number) {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  }
}

function ringSegmentPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polar(cx, cy, radius, startAngle)
  const end = polar(cx, cy, radius, endAngle)
  let delta = endAngle - startAngle
  while (delta < 0) delta += Math.PI * 2
  while (delta >= Math.PI * 2) delta -= Math.PI * 2
  if (delta < 0.001) return ''
  const largeArc = delta > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

const DIGEST_CUT_GAP = 0.18
const PRODUCT_SEALED_GAP = 0.04
const PRODUCT_BROKEN_GAP = 0.42

/**
 * Vector card for deletion mode: both digest arcs are drawn and clickable so the
 * retained (re-ligated) fragment can be chosen without leaving the schema.
 */
function DigestChoiceSchema({
  part,
  fragments,
  selectedFragmentId,
  circular,
  sourceLength,
  selected,
  onSelect,
  onSelectFragment,
}: {
  part: ResolvedCloningPart | null
  fragments: CloningDigestFragment[]
  selectedFragmentId: string | null
  circular: boolean
  sourceLength: number
  selected: boolean
  onSelect: () => void
  onSelectFragment: (fragmentId: string) => void
}) {
  if (fragments.length === 0) {
    return (
      <button
        type="button"
        className="cloning-schema-part cloning-schema-digest is-empty"
        onClick={onSelect}
      >
        <span className="cloning-schema-part-label">Digest</span>
        <span className="cloning-schema-enzyme-pair">Choose two enzymes</span>
      </button>
    )
  }

  const total = fragments.reduce((sum, fragment) => sum + Math.max(1, fragment.length), 0)
  const isKept = (fragment: CloningDigestFragment) => fragment.id === selectedFragmentId

  function renderRing() {
    const cx = 60
    const cy = 60
    const radius = 42
    const drawable = Math.max(0.4, Math.PI * 2 - DIGEST_CUT_GAP * fragments.length)
    let angle = -Math.PI / 2
    return fragments.map((fragment) => {
      const sweep = (Math.max(1, fragment.length) / total) * drawable
      const d = ringSegmentPath(cx, cy, radius, angle, angle + sweep)
      angle += sweep + DIGEST_CUT_GAP
      if (!d) return null
      return (
        <path
          key={fragment.id}
          d={d}
          fill="none"
          strokeWidth={14}
          strokeLinecap="butt"
          className={`cloning-schema-digest-arc${isKept(fragment) ? ' is-keep' : ' is-drop'}`}
          onClick={() => onSelectFragment(fragment.id)}
        >
          <title>{`${isKept(fragment) ? 'Keep' : 'Delete'} ${fragment.label}`}</title>
        </path>
      )
    })
  }

  function renderBar() {
    const y = 60
    const x0 = 12
    const width = 96
    const gapPx = 4
    const drawable = Math.max(8, width - gapPx * Math.max(0, fragments.length - 1))
    let x = x0
    return fragments.map((fragment) => {
      const segWidth = (Math.max(1, fragment.length) / total) * drawable
      const line = (
        <line
          key={fragment.id}
          x1={x}
          y1={y}
          x2={x + segWidth}
          y2={y}
          strokeWidth={14}
          strokeLinecap="butt"
          className={`cloning-schema-digest-arc${isKept(fragment) ? ' is-keep' : ' is-drop'}`}
          onClick={() => onSelectFragment(fragment.id)}
        >
          <title>{`${isKept(fragment) ? 'Keep' : 'Delete'} ${fragment.label}`}</title>
        </line>
      )
      x += segWidth + gapPx
      return line
    })
  }

  const ends = part ? normalizeDnaEnds(part.dnaEnds) : null

  return (
    <div className={`cloning-schema-part cloning-schema-digest${selected ? ' is-selected' : ''}`}>
      <button type="button" className="cloning-schema-part-hit" onClick={onSelect}>
        <div className="cloning-schema-digest-graphic">
          <svg viewBox="0 0 120 120" aria-hidden>
            {circular ? renderRing() : renderBar()}
          </svg>
        </div>
        <div className="cloning-schema-part-meta cloning-schema-vector-meta">
          <strong>Digest</strong>
          <span>{sourceLength.toLocaleString()} bp</span>
        </div>
      </button>
      <div className="cloning-schema-digest-choices" role="radiogroup" aria-label="Fragment to keep">
        {fragments.map((fragment) => (
          <button
            key={fragment.id}
            type="button"
            role="radio"
            aria-checked={isKept(fragment)}
            className={isKept(fragment) ? 'is-keep' : 'is-drop'}
            title={fragment.label}
            onClick={() => onSelectFragment(fragment.id)}
          >
            <span className="cloning-schema-digest-verb">{isKept(fragment) ? 'Keep' : 'Delete'}</span>
            <span className="cloning-schema-digest-size">{fragment.length.toLocaleString()} bp</span>
          </button>
        ))}
      </div>
      {part && ends && (
        <div className="cloning-schema-sticky-row">
          <StickyEndBox
            sequence={part.sequence}
            ends={ends}
            side="upstream"
            overhangSequence={part.upstreamOverhang?.sequence}
          />
          <StickyEndBox
            sequence={part.sequence}
            ends={ends}
            side="downstream"
            overhangSequence={part.downstreamOverhang?.sequence}
          />
        </div>
      )}
    </div>
  )
}

/** Linearized plasmid at one site: open ring + sticky ends after fill/remove. */
function DestroySiteSchema({
  part,
  selected,
  onSelect,
}: {
  part: ResolvedCloningPart | null
  selected: boolean
  onSelect: () => void
}) {
  if (!part) {
    return (
      <button
        type="button"
        className="cloning-schema-part cloning-schema-digest is-empty"
        onClick={onSelect}
      >
        <span className="cloning-schema-part-label">Cut site</span>
        <span className="cloning-schema-enzyme-pair">Choose one enzyme</span>
      </button>
    )
  }

  const ends = normalizeDnaEnds(part.dnaEnds)
  const enzymeLabel = part.leftEnzymeLabel ?? part.leftEnzyme ?? '—'
  const cx = 60
  const cy = 60
  const radius = 42
  const gap = PRODUCT_BROKEN_GAP
  const start = -Math.PI / 2 + gap / 2

  return (
    <div className={`cloning-schema-part cloning-schema-digest${selected ? ' is-selected' : ''}`}>
      <button type="button" className="cloning-schema-part-hit" onClick={onSelect}>
        <div className="cloning-schema-digest-graphic">
          <svg viewBox="0 0 120 120" aria-hidden>
            <path
              d={ringSegmentPath(cx, cy, radius, start, start + Math.PI * 2 - gap)}
              fill="none"
              stroke={part.color}
              strokeWidth={14}
              strokeLinecap="butt"
            />
          </svg>
          <span className="cloning-schema-arc-end is-left" title="Cut site">
            {enzymeLabel}
          </span>
        </div>
        <div className="cloning-schema-part-meta cloning-schema-vector-meta">
          <strong>Linearized</strong>
          <span>{part.length.toLocaleString()} bp</span>
        </div>
      </button>
      <div className="cloning-schema-sticky-row">
        <StickyEndBox
          sequence={part.sequence}
          ends={ends}
          side="upstream"
          overhangSequence={part.upstreamOverhang?.sequence}
        />
        <StickyEndBox
          sequence={part.sequence}
          ends={ends}
          side="downstream"
          overhangSequence={part.downstreamOverhang?.sequence}
        />
      </div>
    </div>
  )
}

function ProductSchema({
  vector,
  inserts,
  insertOrder,
  validation,
  mode,
  selected,
  onSelect,
}: {
  vector: ResolvedCloningPart | null
  inserts: ResolvedCloningPart[]
  insertOrder: number[]
  validation: CloningValidation
  mode: CloningAssemblyMode
  selected: boolean
  onSelect: () => void
}) {
  const diagram = buildCloningProductDiagram(vector, inserts, insertOrder)
  const { layout, segments, junctionSealed } = diagram
  const totalLength = segments.reduce((sum, part) => sum + Math.max(1, part.length), 0)
  const cx = 60
  const cy = 60
  const radius = 42

  const statusLabel =
    layout === 'empty'
      ? 'Not configured'
      : validation.ready && validation.closed
        ? mode === 'delete-fragment' || mode === 'destroy-site'
          ? 'Re-ligated'
          : mode === 'linear-ligation'
            ? 'Circular ligation'
            : 'Closed loop'
        : layout === 'linear'
          ? mode === 'linear-ligation'
            ? validation.ready
              ? 'Linear ligation'
              : segments.length <= 1
                ? 'Add fragments'
                : 'Gaps at mismatched ends'
            : segments.length === 1
              ? 'Linear insert'
              : 'Linear / open'
          : segments.length === 1
            ? mode === 'delete-fragment' || mode === 'destroy-site'
              ? mode === 'destroy-site'
                ? 'Site not destroyed'
                : 'Ends do not ligate'
              : 'Vector only'
            : junctionSealed.every(Boolean)
              ? 'Open product'
              : 'Gaps at mismatched ends'

  function renderCircular() {
    if (segments.length === 0) return null
    // Lone segment: unbroken ring once it self-ligates, otherwise an open C.
    if (segments.length === 1) {
      if (validation.closed) {
        return (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={segments[0]!.color}
            strokeWidth={14}
          />
        )
      }
      const start = -Math.PI / 2 + PRODUCT_BROKEN_GAP / 2
      return (
        <path
          d={ringSegmentPath(cx, cy, radius, start, start + Math.PI * 2 - PRODUCT_BROKEN_GAP)}
          fill="none"
          stroke={segments[0]!.color}
          strokeWidth={14}
          strokeLinecap="butt"
        />
      )
    }

    const gapAngles = junctionSealed.map((sealed) => (sealed ? PRODUCT_SEALED_GAP : PRODUCT_BROKEN_GAP))
    const gapTotal = gapAngles.reduce((sum, gap) => sum + gap, 0)
    const drawable = Math.max(0.2, Math.PI * 2 - gapTotal)
    let angle = -Math.PI / 2

    return segments.map((part, index) => {
      const sweep = (Math.max(1, part.length) / totalLength) * drawable
      const startAngle = angle
      const endAngle = angle + sweep
      angle = endAngle + (gapAngles[index] ?? PRODUCT_BROKEN_GAP)
      const d = ringSegmentPath(cx, cy, radius, startAngle, endAngle)
      if (!d) return null
      return (
        <path
          key={`${part.role}-${index}-${part.color}`}
          d={d}
          fill="none"
          stroke={part.color}
          strokeWidth={14}
          strokeLinecap="butt"
        />
      )
    })
  }

  function renderLinear() {
    if (segments.length === 0) return null
    const y = 60
    const x0 = 14
    const x1 = 106
    const width = x1 - x0
    const gapPx = 10
    const sealedGapPx = 2
    const gaps = junctionSealed.map((sealed) => (sealed ? sealedGapPx : gapPx))
    const gapTotal = gaps.reduce((sum, gap) => sum + gap, 0)
    const drawable = Math.max(8, width - gapTotal)
    let x = x0

    return (
      <>
        {segments.map((part, index) => {
          const segWidth = (Math.max(1, part.length) / totalLength) * drawable
          const line = (
            <line
              key={`${part.role}-${index}-${part.color}`}
              x1={x}
              y1={y}
              x2={x + segWidth}
              y2={y}
              stroke={part.color}
              strokeWidth={14}
              strokeLinecap="butt"
            />
          )
          x += segWidth + (gaps[index] ?? 0)
          return line
        })}
      </>
    )
  }

  function renderEmpty() {
    // Same broken-ring pictogram as mismatched ends, using the high-contrast cloning ink.
    const diagramLine = 'var(--vg-cloning-diagram-ink)'
    const gapAngles = [PRODUCT_BROKEN_GAP, PRODUCT_BROKEN_GAP]
    const gapTotal = gapAngles.reduce((sum, gap) => sum + gap, 0)
    const drawable = Math.max(0.2, Math.PI * 2 - gapTotal)
    let angle = -Math.PI / 2
    return [0, 1].map((index) => {
      const sweep = drawable / 2
      const startAngle = angle
      const endAngle = angle + sweep
      angle = endAngle + (gapAngles[index] ?? PRODUCT_BROKEN_GAP)
      const d = ringSegmentPath(cx, cy, radius, startAngle, endAngle)
      if (!d) return null
      return (
        <path
          key={`empty-segment-${index}`}
          d={d}
          fill="none"
          stroke={diagramLine}
          strokeWidth={14}
          strokeLinecap="butt"
        />
      )
    })
  }

  return (
    <button
      type="button"
      className={`cloning-schema-part cloning-schema-product${layout === 'empty' ? ' is-empty' : ''}${selected ? ' is-selected' : ''}${validation.ready && validation.closed ? ' is-closed' : ' is-open'}`}
      onClick={onSelect}
    >
      <div
        className={`cloning-schema-product-graphic${layout === 'empty' ? ' cloning-schema-empty-graphic' : ''}`}
      >
        <svg viewBox="0 0 120 120" aria-hidden>
          {layout === 'circular'
            ? renderCircular()
            : layout === 'linear'
              ? renderLinear()
              : renderEmpty()}
        </svg>
      </div>
      <div className={`cloning-schema-part-meta${layout === 'empty' ? ' cloning-schema-empty-meta' : ''}`}>
        <strong>Product</strong>
        <span>
          {layout === 'empty'
            ? 'Not configured'
            : validation.productLength
              ? `${validation.productLength.toLocaleString()} bp`
              : totalLength > 0
                ? `${totalLength.toLocaleString()} bp`
                : '—'}
        </span>
        {layout !== 'empty' && (
          <span className={`cloning-schema-status${validation.ready ? ' is-ready' : ' is-invalid'}`}>
            {statusLabel}
          </span>
        )}
      </div>
    </button>
  )
}

export function CloningSchemaPanel({
  vector,
  inserts,
  insertOrder,
  validation,
  activePart,
  mode = 'insert',
  digestFragments = [],
  selectedFragmentId = null,
  sourceLength = 0,
  sourceCircular = true,
  partialDigestWarnings = [],
  onSelectPart,
  onReorderInserts,
  onSelectFragment,
}: CloningSchemaPanelProps) {
  const noInserts = mode === 'delete-fragment' || mode === 'destroy-site'
  const ligating = mode === 'linear-ligation'
  const partLabel = ligating ? 'Fragment' : 'Insert'
  const dragIndexRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  function handleDrop(targetOrderIndex: number) {
    const from = dragIndexRef.current
    if (from === null || from === targetOrderIndex) {
      dragIndexRef.current = null
      setDragIndex(null)
      setDropIndex(null)
      return
    }
    const next = [...insertOrder]
    const [moved] = next.splice(from, 1)
    next.splice(targetOrderIndex, 0, moved!)
    onReorderInserts(next)
    dragIndexRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }

  function beginPointerDrag(event: ReactPointerEvent<HTMLDivElement>, sourceIndex: number) {
    if (event.button !== 0 || !event.isPrimary) return
    const startX = event.clientX
    const startY = event.clientY
    let activated = false

    const targetAt = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY)
      const card = element?.closest('[data-cloning-order-index]') as HTMLElement | null
      const parsed = Number(card?.dataset.cloningOrderIndex)
      return Number.isInteger(parsed) ? parsed : null
    }

    const finish = (pointerEvent: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      const targetIndex = activated ? targetAt(pointerEvent.clientX, pointerEvent.clientY) : null
      if (targetIndex !== null) handleDrop(targetIndex)
      else {
        dragIndexRef.current = null
        setDragIndex(null)
        setDropIndex(null)
      }
      if (activated) {
        // The pointer release also generates a click on WKWebView. Do not let that
        // click select whichever fragment happens to occupy the source card now.
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
    }

    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      dragIndexRef.current = null
      setDragIndex(null)
      setDropIndex(null)
      suppressClickRef.current = false
    }

    const move = (pointerEvent: globalThis.PointerEvent) => {
      if (!activated) {
        const dx = pointerEvent.clientX - startX
        const dy = pointerEvent.clientY - startY
        if (dx * dx + dy * dy < 36) return
        activated = true
        suppressClickRef.current = true
        dragIndexRef.current = sourceIndex
        setDragIndex(sourceIndex)
      }
      pointerEvent.preventDefault()
      setDropIndex(targetAt(pointerEvent.clientX, pointerEvent.clientY))
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }

  return (
    <section
      className={`cloning-schema-panel${noInserts ? ' is-digest-schema' : ''}`}
      aria-label="Cloning schema"
    >
      <div className="cloning-schema-row">
        {ligating ? null : mode === 'delete-fragment' ? (
          <DigestChoiceSchema
            part={vector}
            fragments={digestFragments}
            selectedFragmentId={selectedFragmentId}
            circular={sourceCircular}
            sourceLength={sourceLength}
            selected={activePart === 'vector'}
            onSelect={() => onSelectPart('vector')}
            onSelectFragment={(fragmentId) => onSelectFragment?.(fragmentId)}
          />
        ) : mode === 'destroy-site' ? (
          <DestroySiteSchema
            part={vector}
            selected={activePart === 'vector'}
            onSelect={() => onSelectPart('vector')}
          />
        ) : (
          <VectorSchema
            part={vector}
            selected={activePart === 'vector'}
            onSelect={() => onSelectPart('vector')}
          />
        )}
        {!noInserts &&
          insertOrder.map((insertIndex, orderIndex) => (
            <div key={`insert-order-${orderIndex}-${insertIndex}`} className="cloning-schema-insert-wrap">
              {(!ligating || orderIndex > 0) && (
                <span className="cloning-schema-plus" aria-hidden>
                  +
                </span>
              )}
              <InsertSchema
                part={inserts[insertIndex] ?? null}
                index={insertIndex}
                orderIndex={orderIndex}
                partLabel={partLabel}
                selected={activePart === `insert-${insertIndex}`}
                dragging={dragIndex === orderIndex}
                dropTarget={dropIndex === orderIndex && dragIndex !== null && dragIndex !== orderIndex}
                onSelect={() => {
                  if (!suppressClickRef.current) onSelectPart(`insert-${insertIndex}`)
                }}
                onPointerDragStart={beginPointerDrag}
              />
            </div>
          ))}
        <span className="cloning-schema-arrow" aria-hidden>
          →
        </span>
        <ProductSchema
          vector={ligating ? null : vector}
          inserts={noInserts ? [] : inserts}
          insertOrder={noInserts ? [] : insertOrder}
          validation={validation}
          mode={mode}
          selected={activePart === 'product'}
          onSelect={() => onSelectPart('product')}
        />
      </div>
      {!validation.ready && validation.issues.length > 0 && (
        <div className="cloning-schema-issues" role="status">
          {validation.issues.map((issue) =>
            noInserts ? (
              <p key={`${issue.leftLabel}-${issue.rightLabel}`}>{issue.message}</p>
            ) : (
              <p key={`${issue.leftLabel}-${issue.rightLabel}`}>
                {issue.leftLabel} → {issue.rightLabel}: {issue.message}
              </p>
            ),
          )}
        </div>
      )}
      {partialDigestWarnings.length > 0 && (
        <div className="cloning-schema-partial-warnings" role="status">
          {partialDigestWarnings.map((warning) => (
            <div key={warning.partLabel} className="cloning-schema-partial-warning">
              <strong>{warning.message}</strong>
              {warning.otherFragments.length > 0 && (
                <ul>
                  {warning.otherFragments.map((fragment) => (
                    <li key={`${warning.partLabel}-${fragment.label}-${fragment.length}`}>
                      {fragment.label} · {fragment.length.toLocaleString()} bp
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {dropIndex !== null && dragIndex !== null && dropIndex !== dragIndex && (
        <div className="cloning-schema-drop-hint">
          Drop to reorder {ligating ? 'fragments' : 'inserts'}
          {ligating ? '' : ' clockwise'}.
        </div>
      )}
    </section>
  )
}
