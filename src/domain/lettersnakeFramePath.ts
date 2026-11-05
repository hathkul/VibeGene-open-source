/**
 * LetterSnake frame engine v13.
 * Ported from the standalone LetterSnake prototype — contiguous same-row bands, vertical stems,
 * and shared portal stems for raised inserts. Boundary corners are slightly rounded.
 */

const EPS = 0.01

type Point = { x: number; y: number }

export type SnakeLetter = Point & {
  /** When true, this letter may use mushroom portal geometry between flanking lower runs. */
  portal?: boolean
}

export type SnakeFrameOptions = {
  /** Per-letter portal eligibility; defaults to none when omitted. */
  portalEligible?: boolean[]
  /** Draw half-letter insertion notches for portal oversize inserts. */
  includePortalNotches?: boolean
  /** @deprecated Use includePortalNotches. Draw half-letter divider notches for portal junctions. */
  includeNotches?: boolean
  /**
   * Leave an open gap in the stroked outline where an integrated arrow flap attaches, so
   * no border separates the arrowhead from the frame interior. Fills stay closed.
   */
  arrowMouth?: FrameOutlineMouth
}

type Box = {
  left: number
  right: number
  top: number
  bottom: number
  cx: number
  cy: number
}

type Run = {
  left: number
  right: number
  top: number
  bottom: number
  start: number
  end: number
}

type Rect = {
  left: number
  right: number
  top: number
  bottom: number
}

type Portal = {
  x: number
  hasDivider: boolean
  baselineTop: number
  insertedRaised: boolean
  gapLeft: number
  gapRight: number
}

export type SnakeFrameLayers = {
  fills: string[]
  /** Half-letter portal insertion marks; stroke separately from filled body paths. */
  marks: string[]
  outlines: string[]
}

function letterBox(center: SnakeLetter, halfW: number, halfH: number): Box {
  return {
    left: center.x - halfW,
    right: center.x + halfW,
    top: center.y - halfH,
    bottom: center.y + halfH,
    cx: center.x,
    cy: center.y,
  }
}

function boxesAdjacent(a: Box, b: Box, charW: number) {
  const gap = Math.min(Math.abs(b.left - a.right), Math.abs(a.left - b.right))
  return gap <= charW * 0.55
}

export function buildRuns(boxes: Box[], charW: number): Run[] {
  const runs: Run[] = []
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i]!
    const last = runs[runs.length - 1]
    const prevBox = last ? boxes[last.end] : null
    if (
      last &&
      Math.abs(last.top - box.top) < EPS &&
      prevBox &&
      boxesAdjacent(prevBox, box, charW)
    ) {
      last.left = Math.min(last.left, box.left)
      last.right = Math.max(last.right, box.right)
      last.bottom = Math.max(last.bottom, box.bottom)
      last.end = i
    } else {
      runs.push({
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        start: i,
        end: i,
      })
    }
  }
  return runs
}

export function joinBetween(left: Box, right: Box) {
  if (right.left < left.right - EPS) {
    if (left.top < right.top - EPS) return left.right
    if (left.top > right.top + EPS) return right.left
  }
  return (left.right + right.left) / 2
}

function rect(left: number, right: number, top: number, bottom: number): Rect | null {
  if (right - left < EPS || bottom - top < EPS) return null
  return { left, right, top, bottom }
}

function pointKey(x: number, y: number) {
  return `${x},${y}`
}

function edgeKey(edge: { from: Point; to: Point }) {
  return `${pointKey(edge.from.x, edge.from.y)}>${pointKey(edge.to.x, edge.to.y)}`
}

function sortNumbers(values: number[]) {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b)
}

function pointDistance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pointsCollinear(a: Point, b: Point, c: Point) {
  return Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < EPS
}

/**
 * Build an SVG path. When `cornerRadius` > 0, external corners become slight quadratic
 * rounds (control point at the original vertex) so primer frames look softer without
 * changing the overall silhouette. Open paths (`closed = false`) keep their endpoints
 * sharp and omit the closing `Z`, so an integrated arrow flap can seat flush against the
 * mouth left in the body outline.
 */
function pathFromPoints(points: Point[], cornerRadius = 0, closed = true) {
  if (!points.length) return ''
  const count = points.length
  if (count < 3 || cornerRadius <= EPS) {
    const [first, ...rest] = points
    const body = [`M ${first!.x} ${first!.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)]
    if (closed) body.push('Z')
    return body.join(' ')
  }

  const parts: string[] = []

  for (let index = 0; index < count; index += 1) {
    const curr = points[index]!
    const isEndpoint = !closed && (index === 0 || index === count - 1)
    if (isEndpoint) {
      parts.push(`${index === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`)
      continue
    }

    const prev = points[(index - 1 + count) % count]!
    const next = points[(index + 1) % count]!
    const distPrev = pointDistance(prev, curr)
    const distNext = pointDistance(curr, next)

    if (distPrev < EPS || distNext < EPS || pointsCollinear(prev, curr, next)) {
      parts.push(`${index === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`)
      continue
    }

    const radius = Math.min(cornerRadius, distPrev * 0.5 - EPS, distNext * 0.5 - EPS)
    if (radius <= EPS) {
      parts.push(`${index === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`)
      continue
    }

    const before = {
      x: curr.x + ((prev.x - curr.x) / distPrev) * radius,
      y: curr.y + ((prev.y - curr.y) / distPrev) * radius,
    }
    const after = {
      x: curr.x + ((next.x - curr.x) / distNext) * radius,
      y: curr.y + ((next.y - curr.y) / distNext) * radius,
    }
    parts.push(`${index === 0 ? 'M' : 'L'} ${before.x} ${before.y}`)
    parts.push(`Q ${curr.x} ${curr.y} ${after.x} ${after.y}`)
  }

  if (closed) parts.push('Z')
  return parts.join(' ')
}

/** A gap to leave open on a body-outline edge so an arrow flap can seat flush. */
export type FrameOutlineMouth = {
  side: 'top' | 'bottom'
  y: number
  x0: number
  x1: number
}

function unionBoundaryPaths(rects: Array<Rect | null>, cornerRadius = 0, mouth?: FrameOutlineMouth) {
  const cleanRects = rects.filter((entry): entry is Rect => entry !== null)
  if (!cleanRects.length) return []

  const xBoundaries = cleanRects.flatMap((r) => [r.left, r.right])
  if (mouth) xBoundaries.push(mouth.x0, mouth.x1)
  const xs = sortNumbers(xBoundaries)
  const ys = sortNumbers(cleanRects.flatMap((r) => [r.top, r.bottom]))
  const filled = new Set<string>()

  for (let yi = 0; yi < ys.length - 1; yi += 1) {
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      const cx = (xs[xi]! + xs[xi + 1]!) / 2
      const cy = (ys[yi]! + ys[yi + 1]!) / 2
      if (
        cleanRects.some(
          (r) =>
            cx > r.left + EPS &&
            cx < r.right - EPS &&
            cy > r.top + EPS &&
            cy < r.bottom - EPS,
        )
      ) {
        filled.add(`${xi},${yi}`)
      }
    }
  }

  const isFilled = (xi: number, yi: number) => filled.has(`${xi},${yi}`)
  const edges: Array<{ from: Point; to: Point }> = []

  for (const key of filled) {
    const [xi, yi] = key.split(',').map(Number)
    const left = xs[xi!]!
    const right = xs[xi! + 1]!
    const top = ys[yi!]!
    const bottom = ys[yi! + 1]!

    const inMouthSpan = mouth && left >= mouth.x0 - EPS && right <= mouth.x1 + EPS
    const skipTop = inMouthSpan && mouth!.side === 'top' && Math.abs(top - mouth!.y) < EPS
    const skipBottom = inMouthSpan && mouth!.side === 'bottom' && Math.abs(bottom - mouth!.y) < EPS

    if (!isFilled(xi!, yi! - 1) && !skipTop) edges.push({ from: { x: left, y: top }, to: { x: right, y: top } })
    if (!isFilled(xi! + 1, yi!)) edges.push({ from: { x: right, y: top }, to: { x: right, y: bottom } })
    if (!isFilled(xi!, yi! + 1) && !skipBottom) edges.push({ from: { x: right, y: bottom }, to: { x: left, y: bottom } })
    if (!isFilled(xi! - 1, yi!)) edges.push({ from: { x: left, y: bottom }, to: { x: left, y: top } })
  }

  const byStart = new Map<string, Array<{ from: Point; to: Point }>>()
  const remaining = new Map<string, { from: Point; to: Point }>()
  const incoming = new Set<string>()
  for (const edge of edges) {
    const start = pointKey(edge.from.x, edge.from.y)
    const list = byStart.get(start) ?? []
    list.push(edge)
    byStart.set(start, list)
    remaining.set(edgeKey(edge), edge)
    incoming.add(pointKey(edge.to.x, edge.to.y))
  }

  // Open paths (created by an arrow mouth) must be traced from their source vertex — one
  // with no incoming edge — otherwise starting mid-path leaves dangling fragments.
  const startQueue = [
    ...edges.filter((edge) => !incoming.has(pointKey(edge.from.x, edge.from.y))),
    ...edges,
  ]
  let startCursor = 0

  const paths: string[] = []
  while (remaining.size) {
    let first: { from: Point; to: Point } | undefined
    while (startCursor < startQueue.length) {
      const candidate = startQueue[startCursor++]!
      if (remaining.has(edgeKey(candidate))) {
        first = candidate
        break
      }
    }
    if (!first) first = remaining.values().next().value!
    const points: Point[] = [first.from]
    let current: { from: Point; to: Point } | undefined = first

    while (current) {
      remaining.delete(edgeKey(current))
      points.push(current.to)
      if (points.length > 1 && pointKey(current.to.x, current.to.y) === pointKey(points[0]!.x, points[0]!.y)) break

      const candidates: Array<{ from: Point; to: Point }> =
        byStart.get(pointKey(current.to.x, current.to.y)) ?? []
      current = candidates.find((edge) => remaining.has(edgeKey(edge)))
    }

    const last = points[points.length - 1]!
    const closed = points.length > 1 && pointKey(last.x, last.y) === pointKey(points[0]!.x, points[0]!.y)
    const finalPoints = closed ? points.slice(0, -1) : points
    paths.push(pathFromPoints(finalPoints, cornerRadius, closed))
  }

  return paths
}

/** Slight round relative to the letter cell — enough to soften, not enough to look pill-like. */
const FRAME_CORNER_RADIUS_RATIO = 0.28

function runPortalXs(runs: Run[], boxes: Box[], portalEligible: boolean[]) {
  const map = new Map<number, Portal>()

  for (let i = 1; i < runs.length - 1; i += 1) {
    const run = runs[i]!
    const prev = runs[i - 1]!
    const next = runs[i + 1]!
    const middleEligible = portalEligible.slice(run.start, run.end + 1).every(Boolean)
    if (!middleEligible) continue
    const insertedRaised = run.top < prev.top - EPS && run.top < next.top - EPS
    const insertedRecessed = run.top > prev.top + EPS && run.top > next.top + EPS
    const sameBaseline = Math.abs(prev.top - next.top) < EPS
    if ((!insertedRaised && !insertedRecessed) || !sameBaseline) continue

    const beforeIdx = run.start - 1
    const afterIdx = run.end + 1
    if (beforeIdx < 0 || afterIdx >= boxes.length) continue
    const before = boxes[beforeIdx]!
    const after = boxes[afterIdx]!
    const forward = before.cx <= after.cx
    const gap = forward ? after.left - before.right : before.left - after.right
    const hasDivider = Math.abs(gap) < EPS
    const gapLeft = forward ? before.right : after.right
    const gapRight = forward ? after.left : before.left

    let x: number
    if (Math.abs(before.top - after.top) < EPS) {
      x = forward ? (before.right + after.left) / 2 : (before.left + after.right) / 2
    } else {
      x = joinBetween(boxes[run.end]!, boxes[afterIdx]!)
    }
    map.set(i, {
      x,
      hasDivider,
      baselineTop: prev.top,
      insertedRaised,
      gapLeft: Math.min(gapLeft, gapRight),
      gapRight: Math.max(gapLeft, gapRight),
    })
  }
  return map
}

function notchPath(joinX: number, y1: number, y2: number) {
  return `M ${joinX} ${y1} L ${joinX} ${y2}`
}

function addPortalInsertionNotch(
  portal: Portal,
  halfH: number,
  marks: string[],
  markKeys: Set<string>,
) {
  const pushNotch = (joinX: number, notchTop: number, notchBottom: number) => {
    const markKey = `${Math.round(joinX * 1000)}:${Math.round(notchTop * 1000)}:${Math.round(notchBottom * 1000)}`
    if (markKeys.has(markKey)) return
    markKeys.add(markKey)
    marks.push(notchPath(joinX, notchTop, notchBottom))
  }

  if (portal.hasDivider) {
    const notchTop = portal.insertedRaised ? portal.baselineTop + halfH : portal.baselineTop
    const notchBottom = portal.insertedRaised ? portal.baselineTop + halfH * 2 : portal.baselineTop + halfH
    pushNotch(portal.x, notchTop, notchBottom)
  }
}

export function buildSnakeFrame(
  centers: SnakeLetter[],
  halfW: number,
  halfH: number,
  endCap: number,
  charW: number,
  options?: SnakeFrameOptions,
): SnakeFrameLayers {
  if (!centers.length) return { fills: [], marks: [], outlines: [] }

  const edgePad = Math.max(0, endCap)
  const portalEligible = centers.map((center) => center.portal === true)
  const includePortalNotches = options?.includePortalNotches ?? options?.includeNotches ?? false

  const boxes = centers.map((center) => letterBox(center, halfW, halfH))
  const runs = buildRuns(boxes, charW)
  const stemW = charW * 2
  const portals = runPortalXs(runs, boxes, portalEligible)
  const bodyRects: Array<Rect | null> = []
  const marks: string[] = []
  const markKeys = new Set<string>()

  for (const run of runs) {
    // endCap pads vertical borders at run starts/stops and raised-segment sides so
    // the outline sits a quarter-letter (typical) off the letter cell edge.
    bodyRects.push(rect(run.left - edgePad, run.right + edgePad, run.top, run.bottom))
  }

  for (let i = 1; i < runs.length; i += 1) {
    const prev = runs[i - 1]!
    const run = runs[i]!
    if (Math.abs(prev.top - run.top) > EPS) continue
    const left = Math.min(prev.right, run.left)
    const right = Math.max(prev.right, run.left)
    if (right - left < EPS) continue
    bodyRects.push(rect(left, right, run.top, run.bottom))
  }

  const stemKeys = new Set<string>()
  for (let i = 1; i < runs.length; i += 1) {
    const prev = runs[i - 1]!
    const run = runs[i]!
    if (Math.abs(prev.top - run.top) < EPS) continue

    const prevRaised = prev.top < run.top - EPS
    const runRaised = run.top < prev.top - EPS

    let portalIndex: number | null = null
    if (prevRaised) {
      portalIndex = portals.has(i - 1) ? i - 1 : portals.has(i) ? i : null
    } else if (runRaised) {
      portalIndex = portals.has(i) ? i : portals.has(i - 1) ? i - 1 : null
    }
    const portal = portalIndex !== null ? portals.get(portalIndex) : undefined

    const joinX = portal ? portal.x : joinBetween(boxes[prev.end]!, boxes[run.start]!)

    const lowerTop = Math.max(prev.top, run.top)
    const upperBottom = Math.min(prev.bottom, run.bottom)

    if (portal && portalIndex !== null && includePortalNotches) {
      const insertedRun = runs[portalIndex]!
      const middleEligible = portalEligible.slice(insertedRun.start, insertedRun.end + 1).every(Boolean)
      if (middleEligible) {
        addPortalInsertionNotch(portal, halfH, marks, markKeys)
      }
    }

    let upperTop = upperBottom
    let stemBottom = lowerTop
    if (portal && !portal.hasDivider) {
      const baselineTop = portal.baselineTop
      const baselineMiddle = portal.baselineTop + halfH
      const baselineBottom = portal.baselineTop + halfH * 2
      const insertedRun = runs[portalIndex!]!
      if (portal.insertedRaised) {
        upperTop = Math.min(insertedRun.bottom, baselineTop)
        stemBottom = baselineMiddle
      } else {
        upperTop = baselineMiddle
        stemBottom = Math.max(insertedRun.top, baselineBottom)
      }
    } else if (upperBottom >= lowerTop - EPS) {
      continue
    }

    const stemLeft = portal && !portal.hasDivider
      ? Math.min(joinX - stemW / 2, portal.gapLeft - edgePad)
      : joinX - stemW / 2
    const stemRight = portal && !portal.hasDivider
      ? Math.max(joinX + stemW / 2, portal.gapRight + edgePad)
      : joinX + stemW / 2
    const key = `${Math.round(stemLeft * 1000)}:${Math.round(stemRight * 1000)}:${Math.round(upperTop * 1000)}:${Math.round(stemBottom * 1000)}`
    if (stemKeys.has(key)) continue
    stemKeys.add(key)

    bodyRects.push(rect(stemLeft, stemRight, upperTop, stemBottom))
  }

  const cornerRadius = Math.min(halfW, halfH) * FRAME_CORNER_RADIUS_RATIO
  const boundaryPaths = unionBoundaryPaths(bodyRects, cornerRadius)
  const outlineBoundary = options?.arrowMouth
    ? unionBoundaryPaths(bodyRects, cornerRadius, options.arrowMouth)
    : boundaryPaths
  return { fills: boundaryPaths, marks, outlines: [...outlineBoundary, ...marks] }
}
