import { normalizeDna, reverseComplement } from './sequence'
import type { TraceAlignmentColumn, TraceAlignmentOrientation, TraceTemplateAlignment } from './traceTypes'

const MATCH_SCORE = 2
const MISMATCH_SCORE = -3
const GAP_OPEN = 5
const GAP_EXTEND = 2
const NEG_INF = -1e9
const TRACE_SEED_KMER = 8
const TRACE_SEED_STEP = 4
const TRACE_REGION_MARGIN = 220
const TRACE_MAX_KMER_HITS_PER_SEED = 64
const TRACE_BANDED_GLOBAL_EXTRA_BAND = 500
const TRACE_CIRCULAR_KMER = 20
const TRACE_CIRCULAR_KMER_STEP = 40
const TRACE_CIRCULAR_MAX_HITS_PER_SEED = 5
const TRACE_NEAR_EQUAL_LENGTH_RATIO = 0.9
const TRACE_LOCAL_BAND_RADIUS = 512
const TRACE_MAX_LOCAL_BAND_CELLS = 24_000_000
const TRACE_MAX_LOCAL_SEED_CANDIDATES = 2
// Equivalent to 20 exact matches; avoid reporting short chance hits in large inputs.
const TRACE_MIN_LARGE_LOCAL_SCORE = 40
/**
 * Full affine DP allocates O(query * template) memory.
 * For larger templates, we first estimate a target region via k-mer offsets
 * and then align only that region.
 */
const MAX_FULL_MATRIX_CELLS = 8_000_000

type AlignmentColumn =
  | { type: 'M'; queryIndex: number; textIndex: number; match: boolean }
  | { type: 'insert'; queryIndex: number }
  | { type: 'delete'; textIndex: number }

function basesMatch(queryBase: string, templateBase: string) {
  const query = queryBase.toUpperCase()
  const template = templateBase.toUpperCase()
  if (query === 'N' || template === 'N') return true
  return query === template
}

function localAffineAlignment(
  query: string,
  text: string,
): { columns: AlignmentColumn[]; textStart: number; textEnd: number; score: number } | null {
  const n = query.length
  const m = text.length
  if (!n || !m) return null

  const width = m + 1
  const h = new Float64Array((n + 1) * width)
  const e = new Float64Array((n + 1) * width)
  const f = new Float64Array((n + 1) * width)
  const trace = new Uint8Array((n + 1) * width)

  for (let j = 0; j <= m; j += 1) {
    h[j] = 0
    e[j] = NEG_INF
    f[j] = NEG_INF
  }
  for (let i = 0; i <= n; i += 1) {
    h[i * width] = 0
    e[i * width] = NEG_INF
    f[i * width] = NEG_INF
  }

  let bestScore = 0
  let bestI = 0
  let bestJ = 0

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const idx = i * width + j
      const matchScore = basesMatch(query[i - 1], text[j - 1]) ? MATCH_SCORE : MISMATCH_SCORE
      const diag = h[(i - 1) * width + (j - 1)] + matchScore
      const up = Math.max(h[(i - 1) * width + j] - GAP_OPEN, e[(i - 1) * width + j] - GAP_EXTEND)
      const left = Math.max(h[i * width + (j - 1)] - GAP_OPEN, f[i * width + (j - 1)] - GAP_EXTEND)
      e[idx] = Math.max(e[(i - 1) * width + j] - GAP_EXTEND, h[(i - 1) * width + j] - GAP_OPEN)
      f[idx] = Math.max(f[i * width + (j - 1)] - GAP_EXTEND, h[i * width + (j - 1)] - GAP_OPEN)

      let best = 0
      let direction = 0
      if (diag >= up && diag >= left && diag >= 0) {
        best = diag
        direction = 1
      } else if (up >= left && up >= 0) {
        best = up
        direction = 2
      } else if (left >= 0) {
        best = left
        direction = 3
      }
      h[idx] = best
      trace[idx] = direction

      if (best > bestScore) {
        bestScore = best
        bestI = i
        bestJ = j
      }
    }
  }

  if (bestScore <= 0) return null

  const columnsRev: AlignmentColumn[] = []
  let i = bestI
  let j = bestJ
  while (i > 0 || j > 0) {
    const direction = trace[i * width + j]
    if (direction === 0) break
    if (direction === 1) {
      columnsRev.push({
        type: 'M',
        queryIndex: i - 1,
        textIndex: j - 1,
        match: basesMatch(query[i - 1], text[j - 1]),
      })
      i -= 1
      j -= 1
    } else if (direction === 2) {
      columnsRev.push({ type: 'insert', queryIndex: i - 1 })
      i -= 1
    } else {
      columnsRev.push({ type: 'delete', textIndex: j - 1 })
      j -= 1
    }
  }

  const columns = columnsRev.reverse()
  const textStart = columns.find((column) => column.type === 'M' || column.type === 'delete')
  const textEndColumn = [...columns].reverse().find((column) => column.type === 'M' || column.type === 'delete')
  const textStartIndex = textStart?.type === 'M' ? textStart.textIndex : textStart?.type === 'delete' ? textStart.textIndex : 0
  const textEndIndex =
    textEndColumn?.type === 'M'
      ? textEndColumn.textIndex + 1
      : textEndColumn?.type === 'delete'
        ? textEndColumn.textIndex + 1
        : textStartIndex

  return { columns, textStart: textStartIndex, textEnd: textEndIndex, score: bestScore }
}

function shiftAlignmentColumns(columns: AlignmentColumn[], templateOffset: number) {
  return columns.map((column) => {
    if (column.type === 'M') {
      return { ...column, textIndex: column.textIndex + templateOffset }
    }
    if (column.type === 'delete') {
      return { ...column, textIndex: column.textIndex + templateOffset }
    }
    return column
  })
}

function estimateTemplateRegion(query: string, text: string) {
  if (query.length < TRACE_SEED_KMER || text.length <= query.length + TRACE_REGION_MARGIN * 2) {
    return null
  }

  const votes = new Map<number, number>()
  for (let queryIndex = 0; queryIndex + TRACE_SEED_KMER <= query.length; queryIndex += TRACE_SEED_STEP) {
    const kmer = query.slice(queryIndex, queryIndex + TRACE_SEED_KMER)
    let cursor = 0
    let hitCount = 0
    while (hitCount < TRACE_MAX_KMER_HITS_PER_SEED) {
      const matchIndex = text.indexOf(kmer, cursor)
      if (matchIndex < 0) break
      const offset = matchIndex - queryIndex
      votes.set(offset, (votes.get(offset) ?? 0) + 1)
      hitCount += 1
      cursor = matchIndex + 1
    }
  }

  let bestOffset: number | null = null
  let bestVotes = 0
  votes.forEach((count, offset) => {
    if (count > bestVotes) {
      bestVotes = count
      bestOffset = offset
    }
  })
  if (bestOffset === null) return null

  const start = Math.max(0, bestOffset - TRACE_REGION_MARGIN)
  const end = Math.min(text.length, bestOffset + query.length + TRACE_REGION_MARGIN)
  if (end - start < query.length) return null
  return { start, end }
}

/** Candidate diagonals for a local alignment, including when the query is longer. */
function estimateLocalOffsets(query: string, text: string, radius: number): number[] {
  if (query.length < TRACE_SEED_KMER || text.length < TRACE_SEED_KMER) return []
  const votes = new Map<number, number>()
  for (let queryIndex = 0; queryIndex + TRACE_SEED_KMER <= query.length; queryIndex += TRACE_SEED_STEP) {
    const kmer = query.slice(queryIndex, queryIndex + TRACE_SEED_KMER)
    if (kmer.includes('N')) continue
    let cursor = 0
    for (let hits = 0; hits < TRACE_MAX_KMER_HITS_PER_SEED; hits += 1) {
      const matchIndex = text.indexOf(kmer, cursor)
      if (matchIndex < 0) break
      const offset = matchIndex - queryIndex
      votes.set(offset, (votes.get(offset) ?? 0) + 1)
      cursor = matchIndex + 1
    }
  }
  const ranked = [...votes].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1])
  const offsets: number[] = []
  for (const [offset] of ranked) {
    if (offsets.every((candidate) => Math.abs(candidate - offset) > radius)) offsets.push(offset)
    if (offsets.length === TRACE_MAX_LOCAL_SEED_CANDIDATES) break
  }
  return offsets
}

/** Local affine-gap alignment within a seeded diagonal, with rolling score rows. */
function bandedLocalAffineAlignment(query: string, text: string, offset: number, radius: number) {
  const n = query.length
  const m = text.length
  const starts = new Int32Array(n + 1)
  const ends = new Int32Array(n + 1)
  const offsets = new Int32Array(n + 1)
  let cellCount = 0
  for (let i = 1; i <= n; i += 1) {
    starts[i] = Math.max(1, i + offset - radius)
    ends[i] = Math.min(m, i + offset + radius)
    offsets[i] = cellCount
    cellCount += Math.max(0, ends[i] - starts[i] + 1)
  }
  if (!cellCount || cellCount > TRACE_MAX_LOCAL_BAND_CELLS) return null
  // Low two bits encode the best state; bits 2 and 3 encode gap extensions.
  const trace = new Uint8Array(cellCount)
  const width = Math.min(m, radius * 2 + 1) + 1
  let previousScores = new Float64Array(width)
  let scores = new Float64Array(width)
  let previousGaps = new Float64Array(width)
  let gaps = new Float64Array(width)
  previousGaps.fill(NEG_INF)
  let previousStart = 1
  let previousEnd = 0
  let bestScore = 0
  let bestI = 0
  let bestJ = 0
  for (let i = 1; i <= n; i += 1) {
    const start = starts[i]!
    const end = ends[i]!
    scores.fill(0)
    gaps.fill(NEG_INF)
    let leftGap = NEG_INF
    for (let j = start; j <= end; j += 1) {
      const index = j - start
      const previousIndex = j - previousStart
      const hasUp = j >= previousStart && j <= previousEnd
      const hasDiag = j - 1 >= previousStart && j - 1 <= previousEnd
      const upOpen = (hasUp ? previousScores[previousIndex]! : 0) - GAP_OPEN
      const upExtend = hasUp ? previousGaps[previousIndex]! - GAP_EXTEND : NEG_INF
      const up = Math.max(upOpen, upExtend)
      gaps[index] = up
      const leftOpen = (index > 0 ? scores[index - 1]! : 0) - GAP_OPEN
      const leftExtend = leftGap - GAP_EXTEND
      leftGap = Math.max(leftOpen, leftExtend)
      const diag = (hasDiag ? previousScores[j - 1 - previousStart]! : 0)
        + (basesMatch(query[i - 1]!, text[j - 1]!) ? MATCH_SCORE : MISMATCH_SCORE)
      let score = 0
      let direction = 0
      if (diag > score) { score = diag; direction = 1 }
      if (up > score) { score = up; direction = 2 }
      if (leftGap > score) { score = leftGap; direction = 3 }
      scores[index] = score
      trace[offsets[i]! + index] = direction | (upExtend > upOpen ? 4 : 0) | (leftExtend > leftOpen ? 8 : 0)
      if (score > bestScore) { bestScore = score; bestI = i; bestJ = j }
    }
    ;[previousScores, scores] = [scores, previousScores]
    ;[previousGaps, gaps] = [gaps, previousGaps]
    previousStart = start
    previousEnd = end
  }
  if (!bestScore) return null
  const columns: AlignmentColumn[] = []
  let i = bestI
  let j = bestJ
  let state = 0
  while (i > 0 && j > 0 && j >= starts[i]! && j <= ends[i]!) {
    const entry = trace[offsets[i]! + j - starts[i]!]!
    if (state === 0) {
      const direction = entry & 3
      if (!direction) break
      if (direction === 1) {
        columns.push({ type: 'M', queryIndex: i - 1, textIndex: j - 1, match: basesMatch(query[i - 1]!, text[j - 1]!) })
        i -= 1
        j -= 1
      } else state = direction
    } else if (state === 2) {
      columns.push({ type: 'insert', queryIndex: i - 1 })
      state = entry & 4 ? 2 : 0
      i -= 1
    } else {
      columns.push({ type: 'delete', textIndex: j - 1 })
      state = entry & 8 ? 3 : 0
      j -= 1
    }
  }
  return { columns: columns.reverse(), textStart: j, textEnd: bestJ, score: bestScore }
}

function localAffineAlignmentSeeded(query: string, text: string) {
  const cells = query.length * text.length
  if (cells <= MAX_FULL_MATRIX_CELLS) {
    return localAffineAlignment(query, text)
  }

  const region = estimateTemplateRegion(query, text)
  if (region && query.length * (region.end - region.start) <= MAX_FULL_MATRIX_CELLS) {
    const result = localAffineAlignment(query, text.slice(region.start, region.end))
    if (!result) return null
    return {
      columns: shiftAlignmentColumns(result.columns, region.start),
      textStart: result.textStart + region.start,
      textEnd: result.textEnd + region.start,
      score: result.score,
    }
  }
  const radius = Math.min(TRACE_LOCAL_BAND_RADIUS, Math.floor(TRACE_MAX_LOCAL_BAND_CELLS / (query.length + 1) / 2) - 1)
  if (radius < 1) return null
  let best: ReturnType<typeof bandedLocalAffineAlignment> = null
  for (const offset of estimateLocalOffsets(query, text, radius)) {
    const result = bandedLocalAffineAlignment(query, text, offset, radius)
    if (result && (!best || result.score > best.score)) best = result
  }
  return best && best.score >= TRACE_MIN_LARGE_LOCAL_SCORE ? best : null
}

// Rescue a clipped end only when it independently maps uniquely and joins the
// primary block without a discontinuity in the read. The conservative limits
// keep short repeats and poor read ends from becoming deletion calls.
function rescueDeletion(query: string, text: string, primary: NonNullable<ReturnType<typeof localAffineAlignment>>) {
  const matches = primary.columns.filter((c): c is Extract<AlignmentColumn, { type: 'M' }> => c.type === 'M')
  if (matches.length < 25) return primary
  const first = matches[0]!
  const last = matches[matches.length - 1]!
  let best = primary
  for (const side of ['left', 'right'] as const) {
    const queryOffset = side === 'left' ? 0 : last.queryIndex + 1
    const clipped = side === 'left' ? query.slice(0, first.queryIndex) : query.slice(queryOffset)
    if (clipped.length < 25) continue
    const secondary = localAffineAlignmentSeeded(clipped, text)
    if (!secondary) continue
    const secondaryMatches = secondary.columns.filter((c): c is Extract<AlignmentColumn, { type: 'M' }> => c.type === 'M')
    if (secondaryMatches.length < 25 || secondaryMatches.filter(c => c.match && clipped[c.queryIndex] !== 'N').length / secondaryMatches.length < 0.9) continue
    const sFirst = secondaryMatches[0]!
    const sLast = secondaryMatches[secondaryMatches.length - 1]!
    // A unique 12-mer within the recovered block protects against repeat joins.
    let unique = false
    for (let i = sFirst.queryIndex; i + 12 <= sLast.queryIndex + 1; i++) {
      const seed = clipped.slice(i, i + 12)
      if (seed.includes('N')) continue
      const hit = text.indexOf(seed)
      if (hit >= 0 && text.indexOf(seed, hit + 1) < 0) { unique = true; break }
    }
    if (!unique) continue
    const readGap = side === 'left' ? first.queryIndex - (sLast.queryIndex + queryOffset + 1) : sFirst.queryIndex + queryOffset - last.queryIndex - 1
    const refGap = side === 'left' ? primary.textStart - secondary.textEnd : secondary.textStart - primary.textEnd
    if (readGap !== 0 || refGap < 20 || refGap > 2000) continue
    const shifted = secondary.columns.map(c => c.type === 'delete' ? c : { ...c, queryIndex: c.queryIndex + queryOffset })
    const gapStart = side === 'left' ? secondary.textEnd : primary.textEnd
    const gap: AlignmentColumn[] = Array.from({ length: refGap }, (_, i) => ({ type: 'delete', textIndex: gapStart + i }))
    const score = primary.score + secondary.score - 12
    if (score <= best.score) continue
    const combined = side === 'left' ? [...shifted, ...gap, ...primary.columns] : [...primary.columns, ...gap, ...shifted]
    // Reconcile small alignment artifacts at the join using exact flanking
    // anchors. This also places equivalent repeat breakpoints consistently.
    const gapIndex = side === 'left' ? shifted.length : primary.columns.length
    const leftAnchor = Math.max(0, gapIndex - 16)
    const rightAnchor = Math.min(combined.length - 1, gapIndex + gap.length + 15)
    const a = combined[leftAnchor]
    const b = combined[rightAnchor]
    let refined = combined
    if (a?.type === 'M' && b?.type === 'M' && a.match && b.match) {
      for (let split = a.queryIndex + 1; split <= b.queryIndex; split++) {
        const leftEnd = a.textIndex + split - a.queryIndex
        const rightStart = b.textIndex - (b.queryIndex - split)
        if (rightStart - leftEnd < 20 || rightStart - leftEnd > 2000) continue
        if (query.slice(a.queryIndex + 1, split) !== text.slice(a.textIndex + 1, leftEnd)) continue
        if (query.slice(split, b.queryIndex) !== text.slice(rightStart, b.textIndex)) continue
        const middle: AlignmentColumn[] = []
        for (let i = a.queryIndex + 1; i < split; i++) middle.push({ type: 'M', queryIndex: i, textIndex: a.textIndex + i - a.queryIndex, match: true })
        for (let i = leftEnd; i < rightStart; i++) middle.push({ type: 'delete', textIndex: i })
        for (let i = split; i < b.queryIndex; i++) middle.push({ type: 'M', queryIndex: i, textIndex: rightStart + i - split, match: true })
        refined = [...combined.slice(0, leftAnchor + 1), ...middle, ...combined.slice(rightAnchor)]
        break
      }
    }
    best = {
      columns: refined,
      textStart: side === 'left' ? secondary.textStart : primary.textStart,
      textEnd: side === 'left' ? primary.textEnd : secondary.textEnd,
      score,
    }
  }
  return best
}

/**
 * Banded global alignment (Needleman–Wunsch, linear gap penalty).
 *
 * Designed for long, near-equal-length sequences (e.g. full-length consensus vs reference).
 * Complexity: O(n * bandSize) memory+time.
 */
function bandedGlobalAlignment(
  query: string,
  text: string,
  band: number,
): { columns: AlignmentColumn[]; textStart: number; textEnd: number; score: number } | null {
  const n = query.length
  const m = text.length
  if (!n || !m) return null

  const minBand = Math.abs(n - m)
  const effectiveBand = Math.max(band, minBand)
  const bandSize = effectiveBand * 2 + 1

  const rowStarts = new Int32Array(n + 1)
  const rowEnds = new Int32Array(n + 1)

  for (let i = 0; i <= n; i += 1) {
    const startJ = Math.max(0, i - effectiveBand)
    const endJ = Math.min(m, i + effectiveBand)
    rowStarts[i] = startJ
    rowEnds[i] = endJ
  }

  if (m < rowStarts[n] || m > rowEnds[n]) return null

  const dp = new Float64Array((n + 1) * bandSize)
  dp.fill(NEG_INF)
  const trace = new Uint8Array((n + 1) * bandSize)

  const linearGapPenalty = GAP_OPEN

  function bandIndex(i: number, j: number) {
    if (j < rowStarts[i] || j > rowEnds[i]) return -1
    const offset = j - rowStarts[i]
    if (offset < 0 || offset >= bandSize) return -1
    return i * bandSize + offset
  }

  // init (0,0)
  const start00 = bandIndex(0, 0)
  if (start00 < 0) return null
  dp[start00] = 0

  // init first row
  for (let j = 1; j <= rowEnds[0]; j += 1) {
    const idx = bandIndex(0, j)
    const prev = bandIndex(0, j - 1)
    if (idx < 0 || prev < 0) break
    dp[idx] = dp[prev] - linearGapPenalty
    trace[idx] = 3
  }

  // init first column across rows (only if within band)
  for (let i = 1; i <= n; i += 1) {
    if (rowStarts[i] !== 0) continue
    const idx = bandIndex(i, 0)
    const prev = bandIndex(i - 1, 0)
    if (idx < 0 || prev < 0) continue
    dp[idx] = dp[prev] - linearGapPenalty
    trace[idx] = 2
  }

  for (let i = 1; i <= n; i += 1) {
    const startJ = rowStarts[i]
    const endJ = rowEnds[i]
    for (let j = startJ; j <= endJ; j += 1) {
      if (i === 0 && j === 0) continue
      const idx = bandIndex(i, j)
      if (idx < 0) continue

      let best = NEG_INF
      let dir = 0

      const diagIdx = bandIndex(i - 1, j - 1)
      if (diagIdx >= 0 && j > 0) {
        const matchScore = basesMatch(query[i - 1], text[j - 1]) ? MATCH_SCORE : MISMATCH_SCORE
        const s = dp[diagIdx] + matchScore
        if (s > best) {
          best = s
          dir = 1
        }
      }

      const upIdx = bandIndex(i - 1, j)
      if (upIdx >= 0) {
        const s = dp[upIdx] - linearGapPenalty
        if (s > best) {
          best = s
          dir = 2
        }
      }

      const leftIdx = bandIndex(i, j - 1)
      if (leftIdx >= 0 && j > 0) {
        const s = dp[leftIdx] - linearGapPenalty
        if (s > best) {
          best = s
          dir = 3
        }
      }

      dp[idx] = best
      trace[idx] = dir
    }
  }

  const endIdx = bandIndex(n, m)
  if (endIdx < 0) return null

  const columnsRev: AlignmentColumn[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const idx = bandIndex(i, j)
    if (idx < 0) return null
    const dir = trace[idx]
    if (dir === 1) {
      columnsRev.push({
        type: 'M',
        queryIndex: i - 1,
        textIndex: j - 1,
        match: basesMatch(query[i - 1], text[j - 1]),
      })
      i -= 1
      j -= 1
    } else if (dir === 2) {
      columnsRev.push({ type: 'insert', queryIndex: i - 1 })
      i -= 1
    } else if (dir === 3) {
      columnsRev.push({ type: 'delete', textIndex: j - 1 })
      j -= 1
    } else {
      return null
    }
  }

  return { columns: columnsRev.reverse(), textStart: 0, textEnd: m, score: dp[endIdx] }
}

function estimateCircularTemplateOffset(query: string, text: string): { offset: number; votes: number } | null {
  if (query.length < TRACE_CIRCULAR_KMER || text.length < TRACE_CIRCULAR_KMER) return null

  const doubled = text + text
  const votes = new Map<number, number>()
  for (let queryIndex = 0; queryIndex + TRACE_CIRCULAR_KMER <= query.length; queryIndex += TRACE_CIRCULAR_KMER_STEP) {
    const kmer = query.slice(queryIndex, queryIndex + TRACE_CIRCULAR_KMER)
    let cursor = 0
    let hitCount = 0
    while (hitCount < TRACE_CIRCULAR_MAX_HITS_PER_SEED) {
      const matchIndex = doubled.indexOf(kmer, cursor)
      if (matchIndex < 0 || matchIndex >= text.length + queryIndex) break
      const offset = (((matchIndex - queryIndex) % text.length) + text.length) % text.length
      votes.set(offset, (votes.get(offset) ?? 0) + 1)
      hitCount += 1
      cursor = matchIndex + 1
    }
  }

  let bestOffset: number | null = null
  let bestVotes = 0
  votes.forEach((count, offset) => {
    if (count > bestVotes) {
      bestVotes = count
      bestOffset = offset
    }
  })
  const minVotes = Math.max(8, Math.floor(query.length / (TRACE_CIRCULAR_KMER_STEP * 8)))
  if (bestOffset === null || bestVotes < minVotes) return null
  return { offset: bestOffset, votes: bestVotes }
}

function remapAlignmentToCircularTemplate(
  result: NonNullable<ReturnType<typeof bandedGlobalAlignment>>,
  templateOffset: number,
  templateLength: number,
): NonNullable<ReturnType<typeof bandedGlobalAlignment>> {
  const columns = result.columns.map((column) => {
    if (column.type === 'M') {
      return {
        ...column,
        textIndex: (templateOffset + column.textIndex) % templateLength,
      }
    }
    if (column.type === 'delete') {
      return {
        ...column,
        textIndex: (templateOffset + column.textIndex) % templateLength,
      }
    }
    return column
  })
  // Full-circle near-equal alignments cover the whole template once columns wrap.
  return {
    columns,
    textStart: 0,
    textEnd: templateLength,
    score: result.score,
  }
}

function bandedGlobalAlignmentCircular(
  query: string,
  template: string,
): NonNullable<ReturnType<typeof bandedGlobalAlignment>> | null {
  const lengthRatio = Math.min(query.length, template.length) / Math.max(query.length, template.length)
  if (lengthRatio < TRACE_NEAR_EQUAL_LENGTH_RATIO) return null

  const estimated = estimateCircularTemplateOffset(query, template)
  if (!estimated) return null

  // One full lap of the plasmid starting at the estimated origin.
  const subject = (template + template).slice(estimated.offset, estimated.offset + template.length)
  const band = Math.abs(query.length - template.length) + TRACE_BANDED_GLOBAL_EXTRA_BAND
  const result = bandedGlobalAlignment(query, subject, band)
  if (!result) return null
  return remapAlignmentToCircularTemplate(result, estimated.offset, template.length)
}

function perfectCircularIdentityAlignment(
  length: number,
  templateOffset: number,
): NonNullable<ReturnType<typeof localAffineAlignment>> {
  return {
    columns: Array.from({ length }, (_, i) => ({
      type: 'M' as const,
      queryIndex: i,
      textIndex: (templateOffset + i) % length,
      match: true,
    })),
    textStart: 0,
    textEnd: length,
    score: length * MATCH_SCORE,
  }
}

function traceIndexFromQuery(queryIndex: number, traceLength: number, orientation: TraceAlignmentOrientation) {
  return orientation === 'forward' ? queryIndex : traceLength - 1 - queryIndex
}

function perfectIdentityAlignment(
  length: number,
  _orientation: TraceAlignmentOrientation,
): NonNullable<ReturnType<typeof localAffineAlignment>> {
  void _orientation
  return {
    columns: Array.from({ length }, (_, i) => ({
      type: 'M' as const,
      queryIndex: i,
      textIndex: i,
      match: true,
    })),
    textStart: 0,
    textEnd: length,
    score: length * MATCH_SCORE,
  }
}

function buildAlignmentFromResult(
  result: NonNullable<ReturnType<typeof localAffineAlignment>>,
  orientation: TraceAlignmentOrientation,
  traceLength: number,
): TraceTemplateAlignment {
  const columns: TraceAlignmentColumn[] = []
  let mismatchCount = 0
  let gapCount = 0

  result.columns.forEach((column) => {
    if (column.type === 'M') {
      if (!column.match) mismatchCount += 1
      columns.push({
        kind: 'match',
        templateIndex: column.textIndex,
        traceIndex: traceIndexFromQuery(column.queryIndex, traceLength, orientation),
        match: column.match,
      })
    } else if (column.type === 'insert') {
      gapCount += 1
      columns.push({
        kind: 'traceInsert',
        traceIndex: traceIndexFromQuery(column.queryIndex, traceLength, orientation),
      })
    } else {
      gapCount += 1
      columns.push({ kind: 'templateGap', templateIndex: column.textIndex, traceIndex: -1 })
    }
  })

  const traceStart = columns.find((column) => column.kind === 'match' || column.kind === 'traceInsert')
  const traceEndColumn = [...columns].reverse().find((column) => column.kind === 'match' || column.kind === 'traceInsert')
  const traceStartIndex =
    traceStart?.kind === 'match'
      ? traceStart.traceIndex
      : traceStart?.kind === 'traceInsert'
        ? traceStart.traceIndex
        : 0
  const traceEndIndex =
    traceEndColumn?.kind === 'match'
      ? traceEndColumn.traceIndex + 1
      : traceEndColumn?.kind === 'traceInsert'
        ? traceEndColumn.traceIndex + 1
        : traceStartIndex

  return {
    templateStart: result.textStart,
    templateEnd: result.textEnd,
    traceStart: traceStartIndex,
    traceEnd: traceEndIndex,
    mismatchCount,
    gapCount,
    orientation,
    alignmentScore: result.score,
    columns,
  }
}

export function alignTraceToTemplate(
  traceSequence: string,
  templateSequence: string,
  options?: { topology?: 'circular' | 'linear' },
): TraceTemplateAlignment | null {
  const query = normalizeDna(traceSequence)
  const template = normalizeDna(templateSequence)
  if (!query.length || !template.length) return null
  const topology = options?.topology ?? 'linear'

  if (query === template) {
    return buildAlignmentFromResult(perfectIdentityAlignment(query.length, 'forward'), 'forward', query.length)
  }
  if (reverseComplement(query) === template) {
    return buildAlignmentFromResult(perfectIdentityAlignment(query.length, 'reverse'), 'reverse', query.length)
  }

  // Circular plasmids often have full-length assemblies whose 0-origin differs from the map.
  // Detect that rotation before linear banded global, which assumes start-aligned sequences.
  if (topology === 'circular') {
    const lengthRatio = Math.min(query.length, template.length) / Math.max(query.length, template.length)
    if (lengthRatio >= TRACE_NEAR_EQUAL_LENGTH_RATIO) {
      const forwardOffset = estimateCircularTemplateOffset(query, template)
      if (forwardOffset && query.length === template.length) {
        const subject = (template + template).slice(forwardOffset.offset, forwardOffset.offset + template.length)
        if (query === subject) {
          return buildAlignmentFromResult(
            perfectCircularIdentityAlignment(template.length, forwardOffset.offset),
            'forward',
            query.length,
          )
        }
      }
      const reverseQuery = reverseComplement(query)
      const reverseOffset = estimateCircularTemplateOffset(reverseQuery, template)
      if (reverseOffset && query.length === template.length) {
        const subject = (template + template).slice(reverseOffset.offset, reverseOffset.offset + template.length)
        if (reverseQuery === subject) {
          return buildAlignmentFromResult(
            perfectCircularIdentityAlignment(template.length, reverseOffset.offset),
            'reverse',
            query.length,
          )
        }
      }

      const forwardCircular = bandedGlobalAlignmentCircular(query, template)
      const reverseCircular = bandedGlobalAlignmentCircular(reverseQuery, template)
      if (forwardCircular || reverseCircular) {
        if (forwardCircular && !reverseCircular) {
          return buildAlignmentFromResult(forwardCircular, 'forward', query.length)
        }
        if (!forwardCircular && reverseCircular) {
          return buildAlignmentFromResult(reverseCircular, 'reverse', query.length)
        }
        if (reverseCircular!.score > forwardCircular!.score) {
          return buildAlignmentFromResult(reverseCircular!, 'reverse', query.length)
        }
        return buildAlignmentFromResult(forwardCircular!, 'forward', query.length)
      }
    }
  }

  let forwardResult = localAffineAlignmentSeeded(query, template)
  let reverseResult = localAffineAlignmentSeeded(reverseComplement(query), template)

  if (forwardResult) forwardResult = rescueDeletion(query, template, forwardResult)
  if (reverseResult) reverseResult = rescueDeletion(reverseComplement(query), template, reverseResult)

  // Long, near-equal-length sequences (e.g. full-length nanopore consensus) exceed DP limits,
  // and region seeding can fail when the reference isn't substantially longer than the query.
  // For this case, fall back to banded global alignment.
  if (!forwardResult && !reverseResult) {
    const lengthRatio = Math.min(query.length, template.length) / Math.max(query.length, template.length)
    if (lengthRatio > TRACE_NEAR_EQUAL_LENGTH_RATIO) {
      const band = Math.abs(query.length - template.length) + TRACE_BANDED_GLOBAL_EXTRA_BAND
      forwardResult = bandedGlobalAlignment(query, template, band)
      reverseResult = bandedGlobalAlignment(reverseComplement(query), template, band)
    }
  }

  if (!forwardResult && !reverseResult) return null
  if (forwardResult && !reverseResult) return buildAlignmentFromResult(forwardResult, 'forward', query.length)
  if (!forwardResult && reverseResult) return buildAlignmentFromResult(reverseResult, 'reverse', query.length)

  const forwardScore = forwardResult!.score
  const reverseScore = reverseResult!.score
  if (reverseScore > forwardScore) {
    return buildAlignmentFromResult(reverseResult!, 'reverse', query.length)
  }
  return buildAlignmentFromResult(forwardResult!, 'forward', query.length)
}

export function templateIndexToTraceIndex(alignment: TraceTemplateAlignment, templateIndex: number): number | null {
  for (const column of alignment.columns) {
    if (column.kind === 'match' && column.templateIndex === templateIndex) return column.traceIndex
  }
  return null
}

export function alignmentStatsLabel(alignment: TraceTemplateAlignment) {
  const orientationLabel = alignment.orientation === 'reverse' ? ', reverse' : ''
  const deletions: string[] = []
  let start: number | null = null
  let end = 0
  const flush = () => {
    if (start !== null && end - start >= 20) deletions.push(`candidate deletion ${end - start} bp (${start + 1}..${end})`)
    start = null
  }
  for (const column of alignment.columns) {
    if (column.kind === 'templateGap' && (start === null || column.templateIndex === end)) {
      if (start === null) start = column.templateIndex
      end = column.templateIndex + 1
    } else {
      flush()
      if (column.kind === 'templateGap') { start = column.templateIndex; end = start + 1 }
    }
  }
  flush()
  const deletionLabel = deletions.length ? `, ${deletions.join(', ')}` : ''
  return `${alignment.templateStart + 1}..${alignment.templateEnd} aligned${orientationLabel}, ${alignment.mismatchCount} mismatches, ${alignment.gapCount} gaps/insertions${deletionLabel}`
}

export function alignmentOverlapsTemplateRange(
  alignment: TraceTemplateAlignment,
  templateStart: number,
  templateEnd: number,
) {
  return alignment.templateStart < templateEnd && alignment.templateEnd > templateStart
}

const traceComplementBase: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  N: 'N',
}

function complementTraceBase(base: string) {
  return traceComplementBase[base.toUpperCase()] ?? 'N'
}

/** Build the reference-sequence replacement string for a template index span from an aligned trace. */
export function buildReferenceReplacementFromTrace(
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
  templateStart: number,
  templateEnd: number,
) {
  if (templateStart >= templateEnd) return ''
  const columnByTemplateIndex = new Map<number, TraceTemplateAlignment['columns'][number]>()
  alignment.columns.forEach((column) => {
    if (column.kind === 'match' || column.kind === 'templateGap') {
      columnByTemplateIndex.set(column.templateIndex, column)
    }
  })

  let replacement = ''
  for (let templateIndex = templateStart; templateIndex < templateEnd; templateIndex += 1) {
    const column = columnByTemplateIndex.get(templateIndex)
    if (!column) continue
    if (column.kind === 'templateGap') continue
    const traceBase = baseCalls[column.traceIndex]?.toUpperCase() ?? 'N'
    replacement += alignment.orientation === 'reverse' ? complementTraceBase(traceBase) : traceBase
  }
  return replacement
}
