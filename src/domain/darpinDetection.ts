/**
 * Detect designed ankyrin repeat proteins (DARPins) from sequence.
 *
 * Internal modules follow the Plückthun 33-residue consensus
 * DxxGxTPLHLAxxGHLEIVEVLLKxGADVNA with randomized (paratope) positions
 * 2, 3, 5, 13, 14, 26, and 33. Caps are scored against the Binz/GABP-derived
 * N- and C-terminal capping repeats.
 */

export type DarpinModuleKind = 'N-cap' | 'internal' | 'C-cap'

export type DarpinModule = {
  kind: DarpinModuleKind
  /** 1-based internal-repeat index when kind is 'internal'. */
  index: number | null
  start: number
  end: number
  score: number
  maxScore: number
  /** Fraction of framework score matched (0–1). */
  confidence: number
}

export type DarpinDetection = {
  scheme: 'darpin'
  queryStart: number
  queryEnd: number
  confidence: number
  format: string
  modules: DarpinModule[]
  /** Per-residue labels such as N.17, 1.6, 2.14, C.3; null outside the DARPin. */
  positions: Array<string | null>
  /** Sequence indices of predicted paratope (randomized) residues. */
  paratopeIndices: number[]
}

const INTERNAL_LENGTH = 33
const INTERNAL_RANDOM_POSITIONS = new Set([2, 3, 5, 13, 14, 26, 33])

/** Framework expectations for a 33-residue internal module (1-based positions). */
const INTERNAL_FRAMEWORK: ReadonlyArray<{ position: number; residues: string; weight: number }> = [
  { position: 1, residues: 'D', weight: 0.6 },
  { position: 4, residues: 'G', weight: 1.4 },
  { position: 6, residues: 'T', weight: 2 },
  { position: 7, residues: 'P', weight: 2 },
  { position: 8, residues: 'L', weight: 2 },
  { position: 9, residues: 'H', weight: 1.4 },
  { position: 10, residues: 'LY', weight: 1.2 },
  { position: 11, residues: 'A', weight: 1.4 },
  { position: 12, residues: 'A', weight: 0.8 },
  { position: 15, residues: 'G', weight: 1.4 },
  { position: 16, residues: 'H', weight: 1.4 },
  { position: 17, residues: 'L', weight: 1 },
  { position: 18, residues: 'E', weight: 1.4 },
  { position: 19, residues: 'I', weight: 1 },
  { position: 20, residues: 'VA', weight: 1 },
  { position: 21, residues: 'E', weight: 1.4 },
  { position: 22, residues: 'V', weight: 1 },
  { position: 23, residues: 'L', weight: 1 },
  { position: 24, residues: 'L', weight: 1 },
  { position: 25, residues: 'K', weight: 1.4 },
  { position: 27, residues: 'G', weight: 1.4 },
  { position: 28, residues: 'A', weight: 1.4 },
  { position: 29, residues: 'D', weight: 1.4 },
  { position: 30, residues: 'V', weight: 1.4 },
  { position: 31, residues: 'N', weight: 1.4 },
  { position: 32, residues: 'A', weight: 1.4 },
]

const INTERNAL_MAX_SCORE = INTERNAL_FRAMEWORK.reduce((sum, entry) => sum + entry.weight, 0)

/** Canonical N-cap without optional GS / His-tag prefixes (Binz et al.). */
const N_CAP_CONSENSUS = 'DLGKKLLEAARAGQDDEVRILMANGADVNA'

/**
 * C-cap motifs: original GABP-derived and Interlandi-style redesigned variants.
 * Aligned on the shared DKFGKT…NED…E…LQ core.
 */
const C_CAP_CONSENSUS = 'QDKFGKTAFDISIDNGNEDLAEILQ'
const C_CAP_REDESIGNED = 'QDKFGKTPFDLAIDNGNEDIAEVLQ'

const MIN_INTERNAL_CONFIDENCE = 0.62
const MIN_STACK_INTERNALS = 1
const MIN_OVERALL_CONFIDENCE = 0.55

function sanitizeProtein(sequence: string) {
  return sequence.replace(/[^A-Za-z*]/g, '').toUpperCase()
}

function scoreInternalModule(sequence: string, start: number) {
  if (start < 0 || start + INTERNAL_LENGTH > sequence.length) {
    return { score: 0, confidence: 0 }
  }
  let score = 0
  for (const entry of INTERNAL_FRAMEWORK) {
    const residue = sequence[start + entry.position - 1]
    if (residue && entry.residues.includes(residue)) score += entry.weight
  }
  return { score, confidence: score / INTERNAL_MAX_SCORE }
}

function alignmentScore(query: string, consensus: string) {
  const length = Math.min(query.length, consensus.length)
  if (length < 12) return 0
  let matches = 0
  for (let index = 0; index < length; index += 1) {
    if (query[index] === consensus[index]) matches += 1
  }
  // Prefer near-full-length caps over short accidental matches.
  const lengthFactor = Math.min(1, length / consensus.length)
  return (matches / length) * lengthFactor
}

function bestCapAlignment(
  haystack: string,
  consensus: string,
  minLength: number,
  maxLength: number,
): { start: number; end: number; score: number } | null {
  let best: { start: number; end: number; score: number } | null = null
  const maxStart = Math.max(0, haystack.length - minLength)
  for (let start = 0; start <= maxStart; start += 1) {
    for (let length = minLength; length <= maxLength; length += 1) {
      const end = start + length
      if (end > haystack.length) break
      const score = alignmentScore(haystack.slice(start, end), consensus)
      if (!best || score > best.score) best = { start, end, score }
    }
  }
  return best && best.score >= 0.55 ? best : null
}

function findInternalCandidates(sequence: string) {
  const candidates: Array<{ start: number; score: number; confidence: number }> = []
  for (let start = 0; start <= sequence.length - INTERNAL_LENGTH; start += 1) {
    const { score, confidence } = scoreInternalModule(sequence, start)
    if (confidence >= MIN_INTERNAL_CONFIDENCE) {
      candidates.push({ start, score, confidence })
    }
  }
  return candidates.sort((left, right) => right.confidence - left.confidence || left.start - right.start)
}

function extendStack(
  sequence: string,
  seedStart: number,
): Array<{ start: number; score: number; confidence: number }> {
  const seed = scoreInternalModule(sequence, seedStart)
  if (seed.confidence < MIN_INTERNAL_CONFIDENCE) return []
  const stack = [{ start: seedStart, ...seed }]

  let left = seedStart - INTERNAL_LENGTH
  while (left >= 0) {
    const scored = scoreInternalModule(sequence, left)
    if (scored.confidence < MIN_INTERNAL_CONFIDENCE) break
    stack.unshift({ start: left, ...scored })
    left -= INTERNAL_LENGTH
  }

  let right = seedStart + INTERNAL_LENGTH
  while (right + INTERNAL_LENGTH <= sequence.length) {
    const scored = scoreInternalModule(sequence, right)
    if (scored.confidence < MIN_INTERNAL_CONFIDENCE) break
    stack.push({ start: right, ...scored })
    right += INTERNAL_LENGTH
  }

  return stack
}

function detectNCap(sequence: string, firstInternalStart: number): DarpinModule | null {
  const searchStart = Math.max(0, firstInternalStart - 48)
  const haystack = sequence.slice(searchStart, firstInternalStart)
  if (haystack.length < 18) return null

  // Prefer a cap that abuts the first internal repeat (His-tags stay outside).
  let best: { start: number; end: number; score: number } | null = null
  for (let length = 28; length <= Math.min(34, haystack.length); length += 1) {
    const start = haystack.length - length
    const score = alignmentScore(haystack.slice(start), N_CAP_CONSENSUS)
    if (!best || score > best.score) best = { start, end: haystack.length, score }
  }
  // Also allow a 1–2 residue junction between consensus N-cap and IR1.
  for (let gap = 1; gap <= 2; gap += 1) {
    for (let length = 28; length <= Math.min(32, haystack.length - gap); length += 1) {
      const end = haystack.length - gap
      const start = end - length
      if (start < 0) continue
      const score = alignmentScore(haystack.slice(start, end), N_CAP_CONSENSUS) * 0.98
      if (!best || score > best.score) best = { start, end: haystack.length, score }
    }
  }
  if (!best || best.score < 0.55) return null

  return {
    kind: 'N-cap',
    index: null,
    start: searchStart + best.start,
    end: searchStart + best.end,
    score: best.score,
    maxScore: 1,
    confidence: Math.min(1, best.score),
  }
}

function detectCCap(sequence: string, lastInternalEnd: number): DarpinModule | null {
  const searchOrigin = Math.max(0, lastInternalEnd - 1)
  const haystack = sequence.slice(searchOrigin, Math.min(sequence.length, lastInternalEnd + 40))
  if (haystack.length < 18) return null

  const original = bestCapAlignment(haystack, C_CAP_CONSENSUS, 22, 32)
  const redesigned = bestCapAlignment(haystack, C_CAP_REDESIGNED, 22, 32)
  const best = [original, redesigned].reduce<typeof original>((current, candidate) => {
    if (!candidate) return current
    if (!current || candidate.score > current.score) return candidate
    return current
  }, null)
  if (!best) return null

  // Keep internal repeats intact; the leading C-cap Q is often IR position 33.
  const start = Math.max(searchOrigin + best.start, lastInternalEnd)
  const end = searchOrigin + best.end
  if (end - start < 18) return null

  return {
    kind: 'C-cap',
    index: null,
    start,
    end,
    score: best.score,
    maxScore: 1,
    confidence: best.score,
  }
}

function formatLabel(kind: DarpinModuleKind, moduleIndex: number | null, position: number) {
  if (kind === 'N-cap') return `N.${position}`
  if (kind === 'C-cap') return `C.${position}`
  return `${moduleIndex}.${position}`
}

function buildPositions(sequenceLength: number, modules: DarpinModule[]) {
  const positions = Array<string | null>(sequenceLength).fill(null)
  const paratopeIndices: number[] = []
  for (const module of modules) {
    for (let index = module.start; index < module.end; index += 1) {
      const position = index - module.start + 1
      positions[index] = formatLabel(module.kind, module.index, position)
      if (module.kind === 'internal' && INTERNAL_RANDOM_POSITIONS.has(position)) {
        paratopeIndices.push(index)
      }
    }
  }
  return { positions, paratopeIndices }
}

function formatName(internalCount: number, hasNCap: boolean, hasCCap: boolean) {
  const core = `N${internalCount}C`
  if (hasNCap && hasCCap) return core
  if (hasNCap) return `N${internalCount}`
  if (hasCCap) return `${internalCount}C`
  return `${internalCount}×IR`
}

/** Detect a DARPin domain and assign module.position residue labels. */
export function detectDarpin(sequenceInput: string): DarpinDetection {
  const sequence = sanitizeProtein(sequenceInput)
  if (!sequence) throw new Error('The protein sequence is empty.')

  const candidates = findInternalCandidates(sequence)
  let bestStack: Array<{ start: number; score: number; confidence: number }> = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const stack = extendStack(sequence, candidate.start)
    if (stack.length < MIN_STACK_INTERNALS) continue
    const key = `${stack[0].start}:${stack.length}`
    if (seen.has(key)) continue
    seen.add(key)
    const meanConfidence = stack.reduce((sum, entry) => sum + entry.confidence, 0) / stack.length
    const bestMean = bestStack.length
      ? bestStack.reduce((sum, entry) => sum + entry.confidence, 0) / bestStack.length
      : 0
    if (
      stack.length > bestStack.length
      || (stack.length === bestStack.length && meanConfidence > bestMean)
    ) {
      bestStack = stack
    }
  }

  if (!bestStack.length) {
    throw new Error('No designed ankyrin repeat (DARPin) modules were detected.')
  }

  const internalModules: DarpinModule[] = bestStack.map((entry, index) => ({
    kind: 'internal',
    index: index + 1,
    start: entry.start,
    end: entry.start + INTERNAL_LENGTH,
    score: entry.score,
    maxScore: INTERNAL_MAX_SCORE,
    confidence: entry.confidence,
  }))

  const nCap = detectNCap(sequence, internalModules[0].start)
  const cCap = detectCCap(sequence, internalModules[internalModules.length - 1].end)
  const modules = [
    ...(nCap ? [nCap] : []),
    ...internalModules,
    ...(cCap ? [cCap] : []),
  ]

  const internalConfidence = internalModules.reduce((sum, module) => sum + module.confidence, 0)
    / internalModules.length
  const capBonus = (nCap ? 0.08 * nCap.confidence : 0) + (cCap ? 0.08 * cCap.confidence : 0)
  const confidence = Math.min(1, internalConfidence * 0.84 + capBonus + Math.min(0.08, internalModules.length * 0.02))
  if (confidence < MIN_OVERALL_CONFIDENCE) {
    throw new Error('Ankyrin-like repeats were found, but they do not look like a designed DARPin.')
  }

  const queryStart = modules[0].start
  const queryEnd = modules[modules.length - 1].end
  const { positions, paratopeIndices } = buildPositions(sequence.length, modules)

  return {
    scheme: 'darpin',
    queryStart,
    queryEnd,
    confidence,
    format: formatName(internalModules.length, Boolean(nCap), Boolean(cCap)),
    modules,
    positions,
    paratopeIndices,
  }
}

export const DARPIN_INTERNAL_LENGTH = INTERNAL_LENGTH
export const DARPIN_RANDOM_POSITIONS = [...INTERNAL_RANDOM_POSITIONS]
