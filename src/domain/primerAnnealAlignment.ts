import { normalizeDna, reverseComplement } from './sequence'
import type { PrimerBindingLayout, PrimerLayoutComponent, Strand } from './types'

/**
 * Realistic primer/template annealing via seed-and-extend with a Gotoh affine-gap
 * local alignment (Smith-Waterman style). The primer 3' terminus is used as the seed
 * anchor; the 5' end is free (overhang), internal mismatches stay inside the duplex,
 * and bases that would only "match" across a large gap are left unannealed instead of
 * being scattered along the template.
 *
 * Scoring is tuned so that:
 *  - an isolated internal mismatch flanked by matches stays annealed (2*match > mismatch),
 *  - a short 5' stretch separated from the main duplex by a large gap is NOT bridged
 *    (gap cost grows past any match reward), so it renders as overhang,
 *  - two strong duplex blocks separated by extra primer bases keep both blocks and mark
 *    the extra bases as a single (oversize) insert, even when individual insert bases
 *    opportunistically match template positions in the junction gap.
 *
 * Multi-base central substitutions can still score better as indel paths (opportunistic
 * partial matches). When the net primer length across those fragments equals the
 * template span, they are collapsed back into one annealed duplex so mismatches paint
 * in place rather than as a raised non-aligning segment.
 *
 * A long internal insert can also make bridging gap cost exceed the 5' duplex score, so
 * local SW keeps only the 3'-seeded block. In that case the leading overhang is
 * re-aligned to template immediately upstream of the primary duplex; abutting hits are
 * restored as a second annealed block (distant spurious 5' matches stay overhang).
 */
const MATCH_SCORE = 2
const MISMATCH_SCORE = -3
const GAP_OPEN = 5
const GAP_EXTEND = 2
const NEG_INF = -1e9

const SEED_LENGTHS = [14, 12, 10, 8, 6]
const SEED_WINDOW_BAND = 10
const MIN_ALIGNMENT_SCORE = 8

const iupacMatches: Record<string, string> = {
  A: 'A',
  C: 'C',
  G: 'G',
  T: 'T',
  R: 'AG',
  Y: 'CT',
  S: 'GC',
  W: 'AT',
  K: 'GT',
  M: 'AC',
  B: 'CGT',
  D: 'AGT',
  H: 'ACT',
  V: 'ACG',
  N: 'ACGT',
}

function basesMatch(primerBase: string, templateBase: string) {
  const primer = primerBase.toUpperCase()
  const template = templateBase.toUpperCase()
  // Template N means unknown sequence, not evidence of a compatible duplex.
  if (template === 'N') return false
  const primerAllowed = iupacMatches[primer] ?? primer
  const templateAllowed = iupacMatches[template] ?? template
  return [...primerAllowed].some((base) => templateAllowed.includes(base))
}

type AlignmentColumn =
  | { type: 'M'; queryIndex: number; textIndex: number; match: boolean }
  | { type: 'insert'; queryIndex: number }
  | { type: 'delete'; textIndex: number }

type LocalAlignment = {
  columns: AlignmentColumn[]
  queryStart: number
  queryEnd: number
  score: number
}

/** Gotoh affine local alignment of `query` against `text`. Coordinates are local to `text`. */
function localAffineAlignment(query: string, text: string): LocalAlignment | null {
  const n = query.length
  const m = text.length
  if (!n || !m) return null

  const width = m + 1
  const h = new Float64Array((n + 1) * width)
  const e = new Float64Array((n + 1) * width)
  const f = new Float64Array((n + 1) * width)
  // Traceback: 0 = stop, 1 = diagonal (M), 2 = up (insert in primer), 3 = left (delete/template gap)
  const trace = new Uint8Array((n + 1) * width)

  for (let j = 0; j <= m; j += 1) {
    e[j] = NEG_INF
  }
  for (let i = 0; i <= n; i += 1) {
    f[i * width] = NEG_INF
  }

  let bestScore = 0
  let bestI = 0
  let bestJ = 0

  for (let i = 1; i <= n; i += 1) {
    const rowOffset = i * width
    const prevRowOffset = (i - 1) * width
    for (let j = 1; j <= m; j += 1) {
      const cell = rowOffset + j

      // F: gap in text (primer base consumed) -> insertion in primer.
      const fOpen = h[prevRowOffset + j] - GAP_OPEN
      const fExtend = f[prevRowOffset + j] - GAP_EXTEND
      f[cell] = Math.max(fOpen, fExtend)

      // E: gap in primer (text base consumed) -> deletion / template gap.
      const eOpen = h[rowOffset + (j - 1)] - GAP_OPEN
      const eExtend = e[rowOffset + (j - 1)] - GAP_EXTEND
      e[cell] = Math.max(eOpen, eExtend)

      const diagScore = h[prevRowOffset + (j - 1)] +
        (basesMatch(query[i - 1]!, text[j - 1]!) ? MATCH_SCORE : MISMATCH_SCORE)

      let best = 0
      let pointer = 0
      if (diagScore > best) {
        best = diagScore
        pointer = 1
      }
      if (f[cell] > best) {
        best = f[cell]
        pointer = 2
      }
      if (e[cell] > best) {
        best = e[cell]
        pointer = 3
      }

      h[cell] = best
      trace[cell] = pointer

      if (best > bestScore) {
        bestScore = best
        bestI = i
        bestJ = j
      }
    }
  }

  if (bestScore <= 0) return null

  const columns: AlignmentColumn[] = []
  let i = bestI
  let j = bestJ
  while (i > 0 && j > 0) {
    const pointer = trace[i * width + j]
    if (pointer === 0) break
    if (pointer === 1) {
      columns.push({
        type: 'M',
        queryIndex: i - 1,
        textIndex: j - 1,
        match: basesMatch(query[i - 1]!, text[j - 1]!),
      })
      i -= 1
      j -= 1
    } else if (pointer === 2) {
      columns.push({ type: 'insert', queryIndex: i - 1 })
      i -= 1
    } else {
      columns.push({ type: 'delete', textIndex: j - 1 })
      j -= 1
    }
  }
  columns.reverse()

  const matchColumns = columns.filter((column): column is Extract<AlignmentColumn, { type: 'M' }> => column.type === 'M')
  if (!matchColumns.length) return null

  return {
    columns,
    queryStart: matchColumns[0]!.queryIndex,
    queryEnd: matchColumns[matchColumns.length - 1]!.queryIndex + 1,
    score: bestScore,
  }
}

type SeedWindow = { start: number; end: number }

/** Candidate text windows around exact matches of the primer's 3' seed. */
function seedWindows(query: string, text: string): SeedWindow[] {
  const windows: SeedWindow[] = []
  for (const seedLength of SEED_LENGTHS) {
    if (seedLength > query.length) continue
    // Prefer a perfect 3′ seed; also try excluding the terminal base so a single 3′
    // mismatch still anchors near the true site.
    const seeds = [query.slice(query.length - seedLength)]
    if (seedLength + 1 <= query.length) {
      seeds.push(query.slice(query.length - seedLength - 1, query.length - 1))
    }
    for (const seed of seeds) {
      let index = text.indexOf(seed)
      while (index !== -1) {
        const start = Math.max(0, index - (query.length + SEED_WINDOW_BAND))
        const end = Math.min(text.length, index + seed.length + SEED_WINDOW_BAND + 1)
        windows.push({ start, end })
        index = text.indexOf(seed, index + 1)
      }
    }
    if (windows.length) break
  }

  if (!windows.length) {
    // No usable seed; fall back to scanning the whole text once.
    windows.push({ start: 0, end: text.length })
  }

  // Merge overlapping windows so we never align the same region twice.
  windows.sort((a, b) => a.start - b.start)
  const merged: SeedWindow[] = []
  for (const window of windows) {
    const last = merged[merged.length - 1]
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end)
    } else {
      merged.push({ ...window })
    }
  }
  return merged
}

/** One alignment window per 3' seed occurrence (windows are not merged). */
function seedOccurrenceWindows(query: string, text: string): SeedWindow[] {
  for (const seedLength of SEED_LENGTHS) {
    if (seedLength > query.length) continue
    const seeds = [query.slice(query.length - seedLength)]
    if (seedLength + 1 <= query.length) {
      seeds.push(query.slice(query.length - seedLength - 1, query.length - 1))
    }
    const windows: SeedWindow[] = []
    const seen = new Set<string>()
    for (const seed of seeds) {
      let index = text.indexOf(seed)
      while (index !== -1) {
        // The seed is at the primer's 3′ end. Include the whole possible 5′
        // duplex, not just a fixed band, or longer annealed regions get cut off.
        const start = Math.max(0, index - (query.length - seedLength + SEED_WINDOW_BAND))
        const end = Math.min(text.length, index + seed.length + SEED_WINDOW_BAND + 1)
        const key = `${start}:${end}`
        if (!seen.has(key)) {
          seen.add(key)
          windows.push({ start, end })
        }
        index = text.indexOf(seed, index + 1)
      }
    }
    if (windows.length) return windows
  }

  return [{ start: 0, end: text.length }]
}

type StrandAlignment = {
  alignment: LocalAlignment
  textWindowStart: number
}

function bestAlignmentForText(query: string, text: string): StrandAlignment | null {
  let best: StrandAlignment | null = null
  for (const window of seedWindows(query, text)) {
    const slice = text.slice(window.start, window.end)
    const alignment = localAffineAlignment(query, slice)
    if (!alignment) continue
    if (!best || alignment.score > best.alignment.score) {
      best = { alignment, textWindowStart: window.start }
    }
  }
  return best
}

function allAlignmentsForText(query: string, text: string): StrandAlignment[] {
  const alignments: StrandAlignment[] = []
  for (const window of seedOccurrenceWindows(query, text)) {
    const slice = text.slice(window.start, window.end)
    const alignment = localAffineAlignment(query, slice)
    if (!alignment || alignment.score < MIN_ALIGNMENT_SCORE) continue
    alignments.push({ alignment, textWindowStart: window.start })
  }
  return alignments
}

function layoutDedupKey(layout: PrimerBindingLayout) {
  return `${layout.strand}:${layout.templateStart}:${layout.templateEnd}`
}

type ColumnRun =
  | { kind: 'annealed'; primerBases: string; textStart: number; textEnd: number }
  | { kind: 'insert'; primerBases: string }

/** Group alignment columns into annealed blocks and (5'/internal/3') insert blocks, in primer 5'->3' order. */
function columnsToRuns(query: string, alignment: LocalAlignment, textWindowStart: number): ColumnRun[] {
  const runs: ColumnRun[] = []

  if (alignment.queryStart > 0) {
    runs.push({ kind: 'insert', primerBases: query.slice(0, alignment.queryStart) })
  }

  let annealedBases = ''
  let annealedTextStart = -1
  let annealedTextEnd = -1
  let insertBases = ''

  const flushAnnealed = () => {
    if (!annealedBases) return
    runs.push({
      kind: 'annealed',
      primerBases: annealedBases,
      textStart: textWindowStart + annealedTextStart,
      textEnd: textWindowStart + annealedTextEnd,
    })
    annealedBases = ''
    annealedTextStart = -1
    annealedTextEnd = -1
  }

  const flushInsert = () => {
    if (!insertBases) return
    runs.push({ kind: 'insert', primerBases: insertBases })
    insertBases = ''
  }

  for (const column of alignment.columns) {
    if (column.type === 'M') {
      flushInsert()
      if (!annealedBases) {
        annealedTextStart = column.textIndex
      }
      annealedBases += query[column.queryIndex]!
      annealedTextEnd = column.textIndex + 1
    } else if (column.type === 'insert') {
      flushAnnealed()
      insertBases += query[column.queryIndex]!
    } else {
      // template-gap (deletion in primer): captured by the gap in template coordinates.
      flushAnnealed()
      flushInsert()
    }
  }
  flushAnnealed()
  flushInsert()

  if (alignment.queryEnd < query.length) {
    runs.push({ kind: 'insert', primerBases: query.slice(alignment.queryEnd) })
  }

  return runs
}

function isAnnealedRun(run: ColumnRun): run is Extract<ColumnRun, { kind: 'annealed' }> {
  return run.kind === 'annealed'
}

/**
 * When primer bases between two flanking duplex blocks exceed the template span between
 * those blocks, treat them as one physical loop. Opportunistic gap matches from loop
 * bases are folded back into the loop except for up to `templateGap` junction stem pairs.
 */
function rebuildOversizeInsertRegion(
  query: string,
  alignment: LocalAlignment,
  textWindowStart: number,
  text: string,
  leftRun: Extract<ColumnRun, { kind: 'annealed' }>,
  rightRun: Extract<ColumnRun, { kind: 'annealed' }>,
): { left: ColumnRun; insert: ColumnRun; right: ColumnRun } | null {
  const gapStartAbs = leftRun.textEnd
  const gapEndAbs = rightRun.textStart
  const templateGap = gapEndAbs - gapStartAbs
  const gapStartLocal = gapStartAbs - textWindowStart
  const gapEndLocal = gapEndAbs - textWindowStart

  let rightQueryStart = alignment.queryEnd + 1
  for (const column of alignment.columns) {
    if (column.type === 'M' && textWindowStart + column.textIndex >= gapEndAbs) {
      rightQueryStart = Math.min(rightQueryStart, column.queryIndex)
    }
  }
  if (rightQueryStart > alignment.queryEnd) return null

  let middleStart = rightQueryStart
  for (const column of alignment.columns) {
    if (column.type === 'delete') continue
    if (column.queryIndex >= rightQueryStart) break
    const inGap =
      column.type === 'M' &&
      column.textIndex >= gapStartLocal &&
      column.textIndex < gapEndLocal
    if (column.type === 'insert' || inGap) {
      middleStart = Math.min(middleStart, column.queryIndex)
    }
  }

  let leftQueryEnd = middleStart
  let insertStart = middleStart
  for (let stemSlot = 0; stemSlot < templateGap && insertStart < rightQueryStart; stemSlot += 1) {
    const templateBase = text[gapStartAbs + stemSlot]!
    const primerBase = query[insertStart]!
    if (!basesMatch(primerBase, templateBase)) break
    leftQueryEnd = insertStart + 1
    insertStart += 1
  }

  let leftQueryBegin = alignment.queryEnd + 1
  for (const column of alignment.columns) {
    if (column.type === 'delete') continue
    if (column.queryIndex >= rightQueryStart) break
    if (column.type === 'M' && textWindowStart + column.textIndex < gapEndAbs) {
      leftQueryBegin = Math.min(leftQueryBegin, column.queryIndex)
    }
  }

  let rightQueryEnd = rightQueryStart
  for (const column of alignment.columns) {
    if (column.type === 'M' && textWindowStart + column.textIndex >= gapEndAbs) {
      rightQueryEnd = Math.max(rightQueryEnd, column.queryIndex + 1)
    }
  }

  const leftBases = query.slice(leftQueryBegin, leftQueryEnd)
  const insertBases = query.slice(insertStart, rightQueryStart)
  const rightBases = query.slice(rightQueryStart, rightQueryEnd)
  if (!leftBases.length || !insertBases.length || !rightBases.length) return null

  return {
    left: {
      kind: 'annealed',
      primerBases: leftBases,
      textStart: leftRun.textStart,
      textEnd: gapEndAbs,
    },
    insert: { kind: 'insert', primerBases: insertBases },
    right: {
      kind: 'annealed',
      primerBases: rightBases,
      textStart: gapEndAbs,
      textEnd: rightRun.textEnd,
    },
  }
}

function consolidateOversizeInsertRuns(
  query: string,
  alignment: LocalAlignment,
  textWindowStart: number,
  text: string,
  runs: ColumnRun[],
): ColumnRun[] {
  let current = [...runs]
  let changed = true

  while (changed) {
    changed = false
    for (let leftIdx = 0; leftIdx < current.length - 2; leftIdx += 1) {
      const leftRun = current[leftIdx]!
      if (!isAnnealedRun(leftRun)) continue

      for (let rightIdx = leftIdx + 2; rightIdx < current.length; rightIdx += 1) {
        const rightRun = current[rightIdx]!
        if (!isAnnealedRun(rightRun)) continue

        const middle = current.slice(leftIdx + 1, rightIdx)
        if (!middle.length) continue

        const templateGap = rightRun.textStart - leftRun.textEnd
        const middleBases = middle.reduce((sum, run) => sum + run.primerBases.length, 0)
        const fragmentedMiddle =
          middle.length > 1 || middle.some((run) => run.kind === 'annealed')
        if (!fragmentedMiddle || middleBases <= templateGap) continue

        const rebuilt = rebuildOversizeInsertRegion(
          query,
          alignment,
          textWindowStart,
          text,
          leftRun,
          rightRun,
        )
        if (!rebuilt) continue

        current = [
          ...current.slice(0, leftIdx),
          rebuilt.left,
          rebuilt.insert,
          rebuilt.right,
          ...current.slice(rightIdx + 1),
        ]
        changed = true
        break
      }
      if (changed) break
    }
  }

  return current
}

/**
 * Collapse fragmented duplex runs whose primer bases still pair 1:1 with the template
 * span (net substitution). Smith-Waterman often routes multi-base mismatches through
 * inserts/deletes when a few bases match off-diagonal; without this step those bases
 * render as overhang/insert even when the 5' flank is a perfect contiguous duplex.
 */
function collapseEqualLengthDuplexRuns(runs: ColumnRun[]): ColumnRun[] {
  let firstAnnealed = -1
  let lastAnnealed = -1
  for (let index = 0; index < runs.length; index += 1) {
    if (!isAnnealedRun(runs[index]!)) continue
    if (firstAnnealed < 0) firstAnnealed = index
    lastAnnealed = index
  }
  if (firstAnnealed < 0 || firstAnnealed === lastAnnealed) return runs

  const left = runs[firstAnnealed]!
  const right = runs[lastAnnealed]!
  if (!isAnnealedRun(left) || !isAnnealedRun(right)) return runs

  const duplexRuns = runs.slice(firstAnnealed, lastAnnealed + 1)
  const hasFragmentation =
    duplexRuns.length > 1 &&
    (duplexRuns.some((run) => run.kind === 'insert') ||
      duplexRuns.filter((run) => run.kind === 'annealed').length > 1)
  if (!hasFragmentation) return runs

  const primerBases = duplexRuns.map((run) => run.primerBases).join('')
  const templateSpan = right.textEnd - left.textStart
  if (primerBases.length !== templateSpan) return runs

  return [
    ...runs.slice(0, firstAnnealed),
    {
      kind: 'annealed',
      primerBases,
      textStart: left.textStart,
      textEnd: right.textEnd,
    },
    ...runs.slice(lastAnnealed + 1),
  ]
}

/** Max template bases allowed between a recovered flanking duplex and the primary one.
 *  Covers short template gaps between duplex islands (restriction-site leftovers, small
 *  indels); larger separations stay as independent overhangs / separate sites.
 */
const ARM_RECOVERY_MAX_GAP = 8
const ARM_RECOVERY_MIN_ARM = 8

/** Align an unassigned primer arm against a bounded template window. */
function alignArmToWindow(arm: string, text: string, windowStart: number, windowEnd: number) {
  const window = text.slice(windowStart, windowEnd)
  if (window.length < ARM_RECOVERY_MIN_ARM) return null

  const alignment = localAffineAlignment(arm, window)
  if (!alignment || alignment.score < MIN_ALIGNMENT_SCORE) return null

  let armRuns = columnsToRuns(arm, alignment, windowStart)
  armRuns = consolidateOversizeInsertRuns(arm, alignment, windowStart, text, armRuns)
  return collapseEqualLengthDuplexRuns(armRuns)
}

/**
 * Restore a flanking duplex that local SW dropped because an internal insert made
 * bridging more expensive than restarting at the seed. A looped-out insert costs roughly
 * a fixed entropic penalty rather than the linear per-base gap price the matrix charges,
 * so both arms really do stay hybridized in the lab.
 *
 * Either arm can be the one dropped, depending on which block scores higher. Each search
 * is confined to the template directly beside the surviving duplex and the hit must abut
 * it, so a genuinely non-templated tail stays an overhang.
 */
function recoverFlankingDuplexes(text: string, runs: ColumnRun[]): ColumnRun[] {
  let current = runs

  const leading = current[0]
  const afterLeading = current[1]
  if (
    leading?.kind === 'insert' &&
    afterLeading &&
    isAnnealedRun(afterLeading) &&
    leading.primerBases.length >= ARM_RECOVERY_MIN_ARM
  ) {
    const arm = leading.primerBases
    const armRuns = alignArmToWindow(
      arm,
      text,
      Math.max(0, afterLeading.textStart - (arm.length + SEED_WINDOW_BAND)),
      afterLeading.textStart,
    )
    const abuts = armRuns?.some((run) => {
      if (!isAnnealedRun(run)) return false
      const gap = afterLeading.textStart - run.textEnd
      return gap >= 0 && gap <= ARM_RECOVERY_MAX_GAP
    })
    if (armRuns && abuts) current = [...armRuns, ...current.slice(1)]
  }

  const trailing = current[current.length - 1]
  const beforeTrailing = current[current.length - 2]
  if (
    trailing?.kind === 'insert' &&
    beforeTrailing &&
    isAnnealedRun(beforeTrailing) &&
    trailing.primerBases.length >= ARM_RECOVERY_MIN_ARM
  ) {
    const arm = trailing.primerBases
    const armRuns = alignArmToWindow(
      arm,
      text,
      beforeTrailing.textEnd,
      Math.min(text.length, beforeTrailing.textEnd + arm.length + SEED_WINDOW_BAND),
    )
    const abuts = armRuns?.some((run) => {
      if (!isAnnealedRun(run)) return false
      const gap = run.textStart - beforeTrailing.textEnd
      return gap >= 0 && gap <= ARM_RECOVERY_MAX_GAP
    })
    if (armRuns && abuts) current = [...current.slice(0, -1), ...armRuns]
  }

  return current
}

function annealMaskFromRuns(query: string, runs: ColumnRun[], text: string): boolean[] {
  const mask = Array.from({ length: query.length }, () => false)
  let queryOffset = 0
  for (const run of runs) {
    if (run.kind === 'annealed') {
      for (let index = 0; index < run.primerBases.length; index += 1) {
        const primerBase = run.primerBases[index]!
        const templateBase = text[run.textStart + index] ?? 'N'
        if (basesMatch(primerBase, templateBase)) mask[queryOffset + index] = true
      }
    }
    queryOffset += run.primerBases.length
  }
  return mask
}

function runsToForwardComponents(runs: ColumnRun[]): PrimerLayoutComponent[] {
  return runs.map((run) =>
    run.kind === 'annealed'
      ? { primerBases: run.primerBases, templateStart: run.textStart, templateEnd: run.textEnd }
      : { primerBases: run.primerBases },
  )
}

function runsToReverseComponents(runs: ColumnRun[], textLength: number): PrimerLayoutComponent[] {
  // text was rc(template); convert local rc coordinates back to top-strand coordinates and
  // flip primer bases to top-strand orientation. Reverse the order so it ascends by top coordinate.
  const components = runs.map((run): PrimerLayoutComponent =>
    run.kind === 'annealed'
      ? {
          primerBases: reverseComplement(run.primerBases),
          templateStart: textLength - run.textEnd,
          templateEnd: textLength - run.textStart,
        }
      : { primerBases: reverseComplement(run.primerBases) },
  )
  components.reverse()
  return components
}

export type PrimerAnnealResult = {
  layout: PrimerBindingLayout
  /** Per primer base (5'->3' as written): true if the base is part of the annealed duplex. */
  mask: boolean[]
  annealedCount: number
  /** Contiguous 3' duplex (including internal mismatches) used for Tm. */
  terminalSequence: string
  score: number
}

function terminalDuplexSequence(runs: ColumnRun[]): string {
  // Only the contiguous duplex nearest the 3' end drives extension, so an insert or a
  // template gap upstream of it ends the stretch that counts for Tm.
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index]!
    if (isAnnealedRun(run)) return run.primerBases
  }
  return ''
}

/** Max unmatched 3′ bases to fold into the duplex as terminal mismatches (not overhang). */
const TRAILING_THREE_PRIME_ABSORB_MAX = 3

/**
 * Local SW often drops a 3′ terminal mismatch (ending the alignment is free). PCR primers
 * almost never have true 3′ overhangs — fold a short trailing insert back into the duplex
 * against the adjacent template bases so mismatches paint in place.
 */
function absorbTrailingThreePrimeMismatches(text: string, runs: ColumnRun[]): ColumnRun[] {
  if (runs.length < 2) return runs
  const trailing = runs[runs.length - 1]
  const before = runs[runs.length - 2]
  if (!trailing || trailing.kind !== 'insert' || !before || !isAnnealedRun(before)) return runs
  if (trailing.primerBases.length === 0 || trailing.primerBases.length > TRAILING_THREE_PRIME_ABSORB_MAX) {
    return runs
  }

  const available = text.length - before.textEnd
  const take = Math.min(trailing.primerBases.length, available)
  if (take <= 0) return runs

  const absorbed = trailing.primerBases.slice(0, take)
  const rest = trailing.primerBases.slice(take)
  const next: ColumnRun[] = [
    ...runs.slice(0, -2),
    {
      kind: 'annealed',
      primerBases: before.primerBases + absorbed,
      textStart: before.textStart,
      textEnd: before.textEnd + take,
    },
  ]
  if (rest.length) next.push({ kind: 'insert', primerBases: rest })
  return next
}

function buildPrimerAnnealResult(
  query: string,
  text: string,
  strand: Strand,
  candidate: StrandAlignment,
): PrimerAnnealResult | null {
  const rawRuns = columnsToRuns(query, candidate.alignment, candidate.textWindowStart)
  const consolidated = consolidateOversizeInsertRuns(
    query,
    candidate.alignment,
    candidate.textWindowStart,
    text,
    rawRuns,
  )
  const collapsed = collapseEqualLengthDuplexRuns(consolidated)
  const recovered = recoverFlankingDuplexes(text, collapsed)
  const runs = absorbTrailingThreePrimeMismatches(text, recovered)
  const components =
    strand === 'forward' ? runsToForwardComponents(runs) : runsToReverseComponents(runs, text.length)

  const annealedComponents = components.filter((component) => component.templateStart !== undefined)
  if (!annealedComponents.length) return null

  const templateStart = Math.min(...annealedComponents.map((component) => component.templateStart!))
  const templateEnd = Math.max(
    ...annealedComponents.map(
      (component) => component.templateEnd ?? component.templateStart! + component.primerBases.length,
    ),
  )

  const mask = annealMaskFromRuns(query, runs, text)
  return {
    layout: { strand, templateStart, templateEnd, components },
    mask,
    annealedCount: mask.filter(Boolean).length,
    terminalSequence: terminalDuplexSequence(runs),
    score: candidate.alignment.score,
  }
}

/** Align a primer to the template on the given strand, returning a rich anneal result. */
export function alignPrimerToTemplate(
  template: string,
  primerSequence: string,
  strand: Strand,
): PrimerAnnealResult | null {
  const query = normalizeDna(primerSequence)
  const topText = normalizeDna(template)
  if (!query || !topText) return null

  const text = strand === 'forward' ? topText : reverseComplement(topText)
  const best = bestAlignmentForText(query, text)
  if (!best || best.alignment.score < MIN_ALIGNMENT_SCORE) return null

  return buildPrimerAnnealResult(query, text, strand, best)
}

/** Resolve binding layouts for a primer by aligning against the requested strand(s). */
export function resolvePrimerBindingLayouts(
  template: string,
  primerSequence: string,
  strand?: Strand,
): PrimerBindingLayout[] {
  const query = normalizeDna(primerSequence)
  const topText = normalizeDna(template)
  if (!query || !topText) return []

  const strands: Strand[] = strand ? [strand] : ['forward', 'reverse']
  const layouts: PrimerBindingLayout[] = []
  const seen = new Set<string>()

  for (const candidateStrand of strands) {
    const text = candidateStrand === 'forward' ? topText : reverseComplement(topText)
    for (const candidate of allAlignmentsForText(query, text)) {
      const result = buildPrimerAnnealResult(query, text, candidateStrand, candidate)
      if (!result) continue
      const key = layoutDedupKey(result.layout)
      if (seen.has(key)) continue
      seen.add(key)
      layouts.push(result.layout)
    }
  }

  return layouts
}
