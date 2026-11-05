import {
  defaultGibsonPartConfig,
  gibsonMethodThresholds,
  minGibsonAmplifyBp,
  recommendGibsonOverlap,
  type GibsonAssemblyMethod,
  type GibsonPartConfig,
  type GibsonPrimerDraft,
  type ResolvedGibsonPart,
} from './gibsonAssembly'
import { designPcrPrimerPair } from './pcr'
import { calculateAnnealTemperature } from './primerThermodynamics'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import { createId, normalizeDna, reverseComplement, sanitizeDna } from './sequence'
import type { Primer, RestrictionSite, SequenceRecord } from './types'

export type GibsonAmplifyRange = {
  start: number
  end: number
}

export type GibsonOverlapLengthMode = 'fixed' | 'tm-range'

export type GibsonOverlapPrimerDesignOptions = {
  method: GibsonAssemblyMethod
  geneTmC: number
  overlapMode: GibsonOverlapLengthMode
  /** Used when overlapMode === 'fixed'. */
  fixedOverlapBp: number
  /** Used when overlapMode === 'tm-range'. */
  overlapMinBp: number
  overlapMaxBp: number
  overlapTargetTmC: number
  /**
   * When true, leave the vector as-is (e.g. restriction fragment) and put all
   * homology tails on the insert primers. When false, also PCR the vector
   * fragment with anneal-only primers (no extensions).
   */
  amplifyVectorWithoutExtensions: boolean
  /** Expand homology to cover each cut's concrete recognition match when present. */
  regenerateEnzymeSites: boolean
}

export type GibsonOverlapPrimerDesignResult = {
  overlapBp: number
  insertForward: GibsonPrimerDraft
  insertReverse: GibsonPrimerDraft
  vectorForward: GibsonPrimerDraft | null
  vectorReverse: GibsonPrimerDraft | null
  /** Primers to add onto the insert template so they appear on map/sequence. */
  insertPrimers: Primer[]
  message: string
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

/** Keep only A/C/G/T — enzyme catalog IUPAC (N) must never enter homology tails. */
function concreteDna(sequence: string): string {
  return normalizeDna(sequence).replace(/[^ACGT]/g, '')
}

function normalizeAmplifyRange(
  record: SequenceRecord,
  range: GibsonAmplifyRange,
  method: GibsonAssemblyMethod = 'nebuilder-hifi',
): GibsonAmplifyRange | null {
  const length = record.sequence.length
  if (length <= 0) return null
  const start = Math.max(0, Math.min(length - 1, Math.floor(range.start)))
  const end = Math.max(1, Math.min(length, Math.floor(range.end)))
  if (end <= start) {
    // Circular wrap is not supported for amplify regions in this designer.
    return null
  }
  if (end - start < minGibsonAmplifyBp(method)) return null
  return { start, end }
}

/** Loose span for neighbor homology / display when the stretch is short. */
function sliceAmplifySpan(
  record: SequenceRecord,
  range: GibsonAmplifyRange,
): GibsonAmplifyRange | null {
  const length = record.sequence.length
  if (length <= 0) return null
  const start = Math.max(0, Math.min(length - 1, Math.floor(range.start)))
  const end = Math.max(1, Math.min(length, Math.floor(range.end)))
  if (end <= start || end - start < 2) return null
  return { start, end }
}

function draftFromSequence(name: string, sequence: string, color: string): GibsonPrimerDraft {
  return {
    sourcePrimerId: null,
    name,
    sequence: sanitizeDna(sequence),
    phosphorylated: false,
    color,
  }
}

/** Short kit tag used in designed primer names (`*_HiFi_F`, `*_Gibson_R`, …). */
export function gibsonOverlapPrimerMethodTag(method: GibsonAssemblyMethod): string {
  switch (method) {
    case 'classic-gibson':
      return 'Gibson'
    case 'infusion':
      return 'InFusion'
    case 'nebuilder-hifi':
    default:
      return 'HiFi'
  }
}

function primerName(recordName: string, suffix: 'F' | 'R', method: GibsonAssemblyMethod) {
  const base = (recordName || 'Insert').replace(/\.[^.]+$/, '').trim() || 'Insert'
  return `${base}_${gibsonOverlapPrimerMethodTag(method)}_${suffix}`
}

/** Keep prior designs: bump `…_HiFi_F` → `…_HiFi_v2_F` when the name is taken. */
export function uniquifyGibsonPrimerName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  const match = /^(.*)_(F|R)$/.exec(name)
  if (!match) {
    let version = 2
    while (taken.has(`${name}_v${version}`)) version += 1
    return `${name}_v${version}`
  }
  const stem = match[1]!
  const suffix = match[2]!
  let version = 2
  while (taken.has(`${stem}_v${version}_${suffix}`)) version += 1
  return `${stem}_v${version}_${suffix}`
}

/**
 * Pick homology length from method defaults / UI: fixed bp, or grow until
 * overlap Tm hits the target within [min,max] while staying in the preferred band.
 */
export function resolveGibsonHomologyLength(
  homologyTemplate: string,
  options: Pick<
    GibsonOverlapPrimerDesignOptions,
    'method' | 'overlapMode' | 'fixedOverlapBp' | 'overlapMinBp' | 'overlapMaxBp' | 'overlapTargetTmC'
  >,
  fragmentCount: number,
  maxFragmentBp: number,
  productBp: number,
): number {
  const recommendation = recommendGibsonOverlap({
    method: options.method,
    fragmentCount,
    maxFragmentBp,
    productBp,
  })
  const thresholds = gibsonMethodThresholds(options.method)
  const preferred = recommendation.optimalMinBp
  const template = concreteDna(homologyTemplate)
  const hardMax = Math.min(template.length, recommendation.acceptableMaxBp)
  if (hardMax <= 0) return 0

  if (options.overlapMode === 'fixed') {
    // Prefer the UI fixed length, but never below the preferred-band floor for this design.
    const requested = options.fixedOverlapBp || preferred
    return clampInt(Math.max(requested, preferred), recommendedFloor(recommendation), hardMax)
  }

  const minBp = clampInt(
    Math.max(options.overlapMinBp, recommendation.optimalMinBp),
    recommendedFloor(recommendation),
    hardMax,
  )
  // Prefer the preferred-band ceiling so defaults grade Optimal; allow a higher UI max
  // so users can still request longer usable overlaps.
  const preferredMax = clampInt(recommendation.optimalMaxBp, minBp, hardMax)
  const maxBp = clampInt(options.overlapMaxBp || preferredMax, minBp, hardMax)
  const targetTm = options.overlapTargetTmC || thresholds.minOverlapTmC || 50

  let chosen = minBp
  for (let length = minBp; length <= maxBp; length += 1) {
    chosen = length
    const probe = template.slice(0, length)
    const tm = calculateAnnealTemperature(probe)
    const value = tm.tmC ?? tm.tmMinC
    if (value !== null && value >= targetTm) {
      // Stay inside the preferred band whenever possible so the junction grades Optimal.
      return Math.min(length, preferredMax)
    }
  }
  return Math.min(chosen, preferredMax)
}

function recommendedFloor(recommendation: {
  optimalMinBp: number
  minBp: number
}): number {
  return Math.max(recommendation.minBp, recommendation.optimalMinBp)
}

/**
 * Length that should grade Optimal for both vector termini: take the stricter
 * of the two ends, staying inside the preferred overlap band when possible.
 */
export function resolveGibsonHomologyLengthForTermini(
  upstreamTemplate: string,
  downstreamTemplate: string,
  options: Pick<
    GibsonOverlapPrimerDesignOptions,
    'method' | 'overlapMode' | 'fixedOverlapBp' | 'overlapMinBp' | 'overlapMaxBp' | 'overlapTargetTmC'
  >,
  fragmentCount: number,
  maxFragmentBp: number,
  productBp: number,
): number {
  const down = resolveGibsonHomologyLength(
    downstreamTemplate,
    options,
    fragmentCount,
    maxFragmentBp,
    productBp,
  )
  const up = resolveGibsonHomologyLength(
    upstreamTemplate,
    options,
    fragmentCount,
    maxFragmentBp,
    productBp,
  )
  return Math.max(down, up)
}

/**
 * Concrete recognition bases observed on the plasmid at this cut (never IUPAC from
 * the enzyme catalog — DraIII's CACNNNGTG would otherwise put NNN into primers).
 */
function concreteSiteMatch(site: RestrictionSite | null | undefined): string {
  if (!site) return ''
  return concreteDna(site.match || '')
}

/**
 * Build a homology tail taken from a linearized vector terminus.
 * Always uses the vector fragment's real top-strand DNA so Gibson junctions match.
 * When regenerating, lengthen the tail if needed to cover the cut's concrete site match.
 */
export function homologyFromVectorEnd(
  vectorSequence: string,
  side: 'upstream' | 'downstream',
  overlapBp: number,
  regenerate: boolean,
  site: RestrictionSite | null | undefined,
): string {
  const seq = concreteDna(vectorSequence)
  if (!seq) return ''
  let length = Math.max(0, Math.min(overlapBp, seq.length))
  if (regenerate) {
    const match = concreteSiteMatch(site)
    if (match.length > length) length = Math.min(match.length, seq.length)
  }
  if (length <= 0) return ''
  return side === 'upstream' ? seq.slice(0, length) : seq.slice(Math.max(0, seq.length - length))
}

export function canOfferGibsonOverlapPrimerDesign(input: {
  mode: 'linear' | 'cloning'
  vector: ResolvedGibsonPart
  insertAmplifyRange: GibsonAmplifyRange | null | undefined
  insertRecord: SequenceRecord | null | undefined
  assemblyReady: boolean
  method?: GibsonAssemblyMethod
  /** When true, still offer redesign after the assembly already grades Ready. */
  allowWhenAssemblyReady?: boolean
}): boolean {
  if (input.mode !== 'cloning' && input.mode !== 'linear') return false
  if (input.assemblyReady && !input.allowWhenAssemblyReady) return false
  if (input.mode === 'cloning' && (!input.vector.ready || !input.vector.sequence)) return false
  if (!input.insertRecord?.sequence || !input.insertAmplifyRange) return false
  return Boolean(
    normalizeAmplifyRange(
      input.insertRecord,
      input.insertAmplifyRange,
      input.method ?? 'nebuilder-hifi',
    ),
  )
}

function bindDesignedInsertPrimers(
  insertRecord: SequenceRecord,
  forward: GibsonPrimerDraft,
  reverse: GibsonPrimerDraft,
): { forward: GibsonPrimerDraft; reverse: GibsonPrimerDraft; primers: Primer[] } {
  const forwardId = createId('primer')
  const reverseId = createId('primer')
  const raw: Primer[] = [
    {
      id: forwardId,
      name: forward.name,
      sequence: forward.sequence,
      color: forward.color || '#2563eb',
    },
    {
      id: reverseId,
      name: reverse.name,
      sequence: reverse.sequence,
      color: reverse.color || '#db2777',
    },
  ]
  const primers = refreshExactPrimerBindings(raw, insertRecord.sequence)
  return {
    forward: { ...forward, sourcePrimerId: forwardId, color: primers[0]?.color ?? forward.color },
    reverse: { ...reverse, sourcePrimerId: reverseId, color: primers[1]?.color ?? reverse.color },
    primers,
  }
}

export type GibsonOverlapInsertDesign = GibsonOverlapPrimerDesignResult & {
  /**
   * Index into `fragments[]`, or `null` for the primary slot
   * (Vector in cloning / Fragment 1 in linear assembly).
   */
  fragmentIndex: number | null
  amplifyRange: GibsonAmplifyRange
  label: string
}

export type GibsonOverlapPrimerTarget = {
  fragmentIndex: number | null
  config: GibsonPartConfig
  label: string
}

export type GibsonOverlapAssemblyDesignResult = {
  overlapBp: number
  inserts: GibsonOverlapInsertDesign[]
  vectorForward: GibsonPrimerDraft | null
  vectorReverse: GibsonPrimerDraft | null
  message: string
}

function terminusSlice(sequence: string, side: 'upstream' | 'downstream', length: number): string {
  const seq = concreteDna(sequence)
  if (!seq || length <= 0) return ''
  const n = Math.min(length, seq.length)
  return side === 'upstream' ? seq.slice(0, n) : seq.slice(Math.max(0, seq.length - n))
}

/**
 * Span that will appear in the assembled product for homology planning.
 * Prefer amplify-region cores so regenerating primers does not treat prior
 * overhangs as homology template. Fall back to a ready resolved sequence.
 */
function assemblySpanSequence(
  kind: 'vector' | 'insert',
  vector: ResolvedGibsonPart,
  insert: GibsonPartConfig | null,
  resolvedInsert: ResolvedGibsonPart | null,
): string | null {
  if (kind === 'vector') {
    return vector.ready ? concreteDna(vector.sequence) : null
  }
  if (insert?.record?.sequence && insert.amplifyRange) {
    const range = sliceAmplifySpan(insert.record, insert.amplifyRange)
    if (range) return concreteDna(insert.record.sequence.slice(range.start, range.end))
  }
  if (resolvedInsert?.ready && resolvedInsert.sequence) {
    return concreteDna(resolvedInsert.sequence)
  }
  return null
}

export function listGibsonOverlapPrimerTargets(input: {
  mode: 'linear' | 'cloning'
  vector: ResolvedGibsonPart
  /** Primary/Vector slot config — required so linear Fragment 1 amplify ranges are offered. */
  primaryConfig?: GibsonPartConfig | null
  fragments: GibsonPartConfig[]
  fragmentOrder: number[]
  resolvedFragments: ResolvedGibsonPart[]
  assemblyReady: boolean
  method?: GibsonAssemblyMethod
  /**
   * When false (default), skip inserts that already resolve as ready PCR/direct
   * products — used for the first “Choose primers” pass. When true, include
   * them so primers can be regenerated after a method change.
   */
  includeReadyInserts?: boolean
}): GibsonOverlapPrimerTarget[] {
  const includeReadyInserts = Boolean(input.includeReadyInserts)
  if (input.mode !== 'cloning' && input.mode !== 'linear') return []
  if (input.mode === 'cloning' && (!input.vector.ready || !input.vector.sequence)) return []
  const method = input.method ?? 'nebuilder-hifi'

  const targets: GibsonOverlapPrimerTarget[] = []

  const consider = (
    fragmentIndex: number | null,
    config: GibsonPartConfig | null | undefined,
    resolved: ResolvedGibsonPart | null | undefined,
    fallbackLabel: string,
  ) => {
    if (!config?.record || !config.amplifyRange) return
    if (
      !canOfferGibsonOverlapPrimerDesign({
        mode: input.mode,
        vector: input.vector,
        insertAmplifyRange: config.amplifyRange,
        insertRecord: config.record,
        assemblyReady: input.assemblyReady,
        allowWhenAssemblyReady: includeReadyInserts,
        method,
      })
    ) {
      return
    }
    if (resolved?.ready && !includeReadyInserts) return
    targets.push({
      fragmentIndex,
      config,
      label: resolved?.label ?? fallbackLabel,
    })
  }

  if (input.mode === 'linear') {
    consider(null, input.primaryConfig ?? null, input.vector, input.vector.label || 'Fragment 1')
  }

  const order =
    input.fragmentOrder.length > 0
      ? input.fragmentOrder
      : input.fragments.map((_, index) => index)

  for (const fragmentIndex of order) {
    consider(
      fragmentIndex,
      input.fragments[fragmentIndex],
      input.resolvedFragments[fragmentIndex],
      `Fragment ${fragmentIndex + 1}`,
    )
  }
  return targets
}

/**
 * Design overlapping PCR primers for amplify-range parts in assembly order.
 * Cloning: full overhangs against the vector; ~half/half at insert–insert junctions.
 * Linear: ~half/half between consecutive fragments; no homology on free chain ends.
 */
export function designGibsonOverlapPrimersForAssembly(input: {
  mode?: 'linear' | 'cloning'
  vector: ResolvedGibsonPart
  /** Primary slot config (Fragment 1 in linear); optional for cloning-only callers. */
  primaryConfig?: GibsonPartConfig | null
  fragments: GibsonPartConfig[]
  fragmentOrder: number[]
  resolvedFragments: ResolvedGibsonPart[]
  vectorLeftSite?: RestrictionSite | null
  vectorRightSite?: RestrictionSite | null
  options: GibsonOverlapPrimerDesignOptions
  /** Redesign inserts that already have PCR primers / are Ready (default true). */
  includeReadyInserts?: boolean
}): GibsonOverlapAssemblyDesignResult | null {
  const mode = input.mode ?? 'cloning'
  const includeReadyInserts = input.includeReadyInserts !== false
  const targets = listGibsonOverlapPrimerTargets({
    mode,
    vector: input.vector,
    primaryConfig: input.primaryConfig,
    fragments: input.fragments,
    fragmentOrder: input.fragmentOrder,
    resolvedFragments: input.resolvedFragments,
    assemblyReady: false,
    method: input.options.method,
    includeReadyInserts,
  })
  if (targets.length === 0) return null

  const order =
    input.fragmentOrder.length > 0
      ? input.fragmentOrder
      : input.fragments.map((_, index) => index)

  type ChainNode = {
    kind: 'vector' | 'insert'
    fragmentIndex: number | null
    sequence: string
  }

  const chain: ChainNode[] = []
  let vectorSeq = ''
  if (mode === 'cloning') {
    const span = assemblySpanSequence('vector', input.vector, null, null)
    if (!span) return null
    vectorSeq = span
    chain.push({ kind: 'vector', fragmentIndex: null, sequence: span })
  } else {
    const primaryConfig = input.primaryConfig ?? null
    const span = assemblySpanSequence('insert', input.vector, primaryConfig, input.vector)
    if (!span) return null
    chain.push({ kind: 'insert', fragmentIndex: null, sequence: span })
  }

  for (const fragmentIndex of order) {
    const config = input.fragments[fragmentIndex] ?? null
    const resolved = input.resolvedFragments[fragmentIndex] ?? null
    const span = assemblySpanSequence('insert', input.vector, config, resolved)
    if (!span) {
      // Every ordered fragment must contribute a span for neighbor homology.
      return null
    }
    chain.push({ kind: 'insert', fragmentIndex, sequence: span })
  }

  if (chain.length < 2) return null

  const digest = input.vector.selectedDigest
  const followsLeftToRight = digest?.followsLeftToRight !== false
  const vectorUpstreamSite =
    mode === 'cloning'
      ? followsLeftToRight
        ? input.vectorLeftSite ?? input.vectorRightSite
        : input.vectorRightSite ?? input.vectorLeftSite
      : null
  const vectorDownstreamSite =
    mode === 'cloning'
      ? followsLeftToRight
        ? input.vectorRightSite ?? input.vectorLeftSite
        : input.vectorLeftSite ?? input.vectorRightSite
      : null

  const fragmentCount = chain.length
  const sizes = chain.map((node) => node.sequence.length)
  const maxFragmentBp = Math.max(...sizes)
  const productBp = sizes.reduce((sum, length) => sum + length, 0)

  const probes = chain.flatMap((node) => [
    terminusSlice(node.sequence, 'upstream', 80),
    terminusSlice(node.sequence, 'downstream', 80),
  ])
  const overlapBp = probes.reduce(
    (best, probe) =>
      Math.max(
        best,
        resolveGibsonHomologyLength(
          probe,
          input.options,
          fragmentCount,
          maxFragmentBp,
          productBp,
        ),
      ),
    0,
  )
  if (overlapBp <= 0) return null

  const inserts: GibsonOverlapInsertDesign[] = []
  for (const target of targets) {
    const chainIndex = chain.findIndex((node) => node.fragmentIndex === target.fragmentIndex)
    if (chainIndex < 0) return null
    const prev =
      mode === 'cloning'
        ? chain[(chainIndex - 1 + chain.length) % chain.length]!
        : chainIndex > 0
          ? chain[chainIndex - 1]!
          : null
    const next =
      mode === 'cloning'
        ? chain[(chainIndex + 1) % chain.length]!
        : chainIndex < chain.length - 1
          ? chain[chainIndex + 1]!
          : null
    const insertRecord = target.config.record
    const range = normalizeAmplifyRange(
      insertRecord!,
      target.config.amplifyRange!,
      input.options.method,
    )
    if (!insertRecord || !range) return null

    // Balance PCR primer lengths while keeping assembled junctions at overlapBp:
    // • vector-adjacent side → full overhang (vector termini aren’t PCR-tailed)
    // • insert–insert / linear internal → half overhang on each oligo
    // • linear free ends → no overhang
    // • single insert (vector both sides) → full overhang on forward and reverse
    let forwardOverhangBp: number
    let reverseOverhangBp: number
    if (!prev && !next) {
      forwardOverhangBp = 0
      reverseOverhangBp = 0
    } else if (!prev) {
      forwardOverhangBp = 0
      reverseOverhangBp = Math.max(1, Math.floor(overlapBp / 2))
    } else if (!next) {
      forwardOverhangBp = Math.max(1, Math.ceil(overlapBp / 2))
      reverseOverhangBp = 0
    } else if (prev.kind === 'vector' && next.kind === 'vector') {
      forwardOverhangBp = overlapBp
      reverseOverhangBp = overlapBp
    } else if (prev.kind === 'vector') {
      forwardOverhangBp = overlapBp
      reverseOverhangBp = Math.max(1, Math.floor(overlapBp / 2))
    } else if (next.kind === 'vector') {
      forwardOverhangBp = Math.max(1, Math.ceil(overlapBp / 2))
      reverseOverhangBp = overlapBp
    } else {
      reverseOverhangBp = Math.max(1, Math.floor(overlapBp / 2))
      forwardOverhangBp = Math.max(1, overlapBp - reverseOverhangBp)
    }

    const downHomology = prev
      ? homologyFromVectorEnd(
          prev.sequence,
          'downstream',
          forwardOverhangBp,
          Boolean(input.options.regenerateEnzymeSites && prev.kind === 'vector'),
          vectorDownstreamSite,
        )
      : ''
    const upHomology = next
      ? homologyFromVectorEnd(
          next.sequence,
          'upstream',
          reverseOverhangBp,
          Boolean(input.options.regenerateEnzymeSites && next.kind === 'vector'),
          vectorUpstreamSite,
        )
      : ''

    const takenNames = new Set(insertRecord.primers.map((primer) => primer.name))
    const forwardName = uniquifyGibsonPrimerName(
      primerName(insertRecord.name, 'F', input.options.method),
      takenNames,
    )
    takenNames.add(forwardName)
    const reverseName = uniquifyGibsonPrimerName(
      primerName(insertRecord.name, 'R', input.options.method),
      takenNames,
    )

    const anneal = designPcrPrimerPair(insertRecord, range.start, range.end, input.options.geneTmC)
    const forwardDraft = draftFromSequence(
      forwardName,
      `${downHomology}${anneal.forward.sequence}`,
      '#2563eb',
    )
    const reverseDraft = draftFromSequence(
      reverseName,
      `${reverseComplement(upHomology)}${anneal.reverse.sequence}`,
      '#db2777',
    )
    const bound = bindDesignedInsertPrimers(insertRecord, forwardDraft, reverseDraft)
    inserts.push({
      fragmentIndex: target.fragmentIndex,
      amplifyRange: range,
      label: target.label,
      overlapBp,
      insertForward: bound.forward,
      insertReverse: bound.reverse,
      vectorForward: null,
      vectorReverse: null,
      insertPrimers: bound.primers,
      message: `Designed primers for ${target.label}.`,
    })
  }

  if (inserts.length === 0) return null

  let vectorForward: GibsonPrimerDraft | null = null
  let vectorReverse: GibsonPrimerDraft | null = null
  if (
    mode === 'cloning' &&
    !input.options.amplifyVectorWithoutExtensions &&
    input.vector.source?.sequence &&
    vectorSeq
  ) {
    const vectorTemplate: SequenceRecord = {
      ...input.vector.source,
      topology: 'linear',
      sequence: vectorSeq,
      features: [],
      primers: [],
    }
    const vectorAnneal = designPcrPrimerPair(vectorTemplate, 0, vectorSeq.length, input.options.geneTmC)
    const vectorTaken = new Set(input.vector.source.primers.map((primer) => primer.name))
    const vectorForwardName = uniquifyGibsonPrimerName(
      primerName(input.vector.name, 'F', input.options.method),
      vectorTaken,
    )
    vectorTaken.add(vectorForwardName)
    const vectorReverseName = uniquifyGibsonPrimerName(
      primerName(input.vector.name, 'R', input.options.method),
      vectorTaken,
    )
    vectorForward = draftFromSequence(
      vectorForwardName,
      vectorAnneal.forward.sequence,
      '#2563eb',
    )
    vectorReverse = draftFromSequence(
      vectorReverseName,
      vectorAnneal.reverse.sequence,
      '#db2777',
    )
  }

  const methodLabel = gibsonMethodThresholds(input.options.method).shortLabel
  return {
    overlapBp,
    inserts,
    vectorForward,
    vectorReverse,
    message: `Designed ${methodLabel} primers for ${inserts.length} fragment${
      inserts.length === 1 ? '' : 's'
    } with ${overlapBp} bp overlaps.`,
  }
}

/**
 * Design insert (and optional vector) PCR primers so a selected insert stretch
 * can Gibson-assemble into an already-linearized vector.
 *
 * Junction chemistry: insert forward overhang = vector 3′ terminus; insert
 * reverse overhang = RC(vector 5′ terminus) — the termini of the linearized
 * vector fragment.
 */
export function designGibsonOverlapPrimers(input: {
  vector: ResolvedGibsonPart
  insertRecord: SequenceRecord
  insertAmplifyRange: GibsonAmplifyRange
  vectorLeftSite?: RestrictionSite | null
  vectorRightSite?: RestrictionSite | null
  options: GibsonOverlapPrimerDesignOptions
}): GibsonOverlapPrimerDesignResult | null {
  const synthetic: GibsonPartConfig = {
    ...defaultGibsonPartConfig('fragment', input.insertRecord),
    amplifyRange: input.insertAmplifyRange,
  }
  const assembly = designGibsonOverlapPrimersForAssembly({
    vector: input.vector,
    fragments: [synthetic],
    fragmentOrder: [0],
    resolvedFragments: [
      {
        role: 'fragment',
        configIndex: 0,
        name: input.insertRecord.name,
        label: 'Fragment 1',
        color: '#3b6fd8',
        orientation: 'forward',
        linearizationMode: 'pcr',
        linearizationDetails: {
          method: 'pcr',
          forwardPrimer: { name: synthetic.forwardPrimer.name, sequence: synthetic.forwardPrimer.sequence },
          reversePrimer: { name: synthetic.reversePrimer.name, sequence: synthetic.reversePrimer.sequence },
          polymerase: synthetic.polymerase,
        },
        sequence: '',
        features: [],
        primers: [],
        source: input.insertRecord,
        originOffsetInPart: null,
        ready: false,
        message: '',
        amplifyRange: input.insertAmplifyRange,
        selectedStretchBp:
          input.insertAmplifyRange.end - input.insertAmplifyRange.start > 0
            ? input.insertAmplifyRange.end - input.insertAmplifyRange.start
            : null,
        amplicons: [],
        digestFragments: [],
        selectedAmplicon: null,
        selectedDigest: null,
      },
    ],
    vectorLeftSite: input.vectorLeftSite,
    vectorRightSite: input.vectorRightSite,
    options: input.options,
  })
  const first = assembly?.inserts[0]
  if (!assembly || !first) return null
  return {
    overlapBp: first.overlapBp,
    insertForward: first.insertForward,
    insertReverse: first.insertReverse,
    vectorForward: assembly.vectorForward,
    vectorReverse: assembly.vectorReverse,
    insertPrimers: first.insertPrimers,
    message: assembly.message,
  }
}

/** Append designed Gibson primers onto the insert template; prior primers are kept. */
export function mergeGibsonDesignedPrimersOntoRecord(
  record: SequenceRecord,
  designed: Primer[],
): SequenceRecord {
  const existingIds = new Set(record.primers.map((primer) => primer.id))
  const additions = designed.filter((primer) => !existingIds.has(primer.id))
  return {
    ...record,
    primers: refreshExactPrimerBindings([...record.primers, ...additions], record.sequence),
  }
}

/** Default UI values that, with Choose Primers, should grade Optimal for the method. */
export function defaultGibsonOverlapPrimerOptions(
  method: GibsonAssemblyMethod,
  fragmentCount = 2,
  sizes?: { maxFragmentBp?: number; productBp?: number },
): GibsonOverlapPrimerDesignOptions {
  const recommendation = recommendGibsonOverlap({
    method,
    fragmentCount,
    maxFragmentBp: sizes?.maxFragmentBp ?? 3000,
    productBp: sizes?.productBp ?? 6000,
  })
  const thresholds = gibsonMethodThresholds(method)
  /**
   * SnapGene-style kit defaults: fixed length inside the preferred band.
   * Classic / HiFi use the upper preferred length so terminus Tm typically clears
   * the kit floor (≥48 °C). In-Fusion uses the exact recommended length (15 / 20).
   */
  const fixedOverlapBp =
    method === 'infusion' ? recommendation.optimalMinBp : recommendation.optimalMaxBp

  return {
    method,
    geneTmC: 60,
    overlapMode: 'fixed',
    fixedOverlapBp,
    overlapMinBp: recommendation.optimalMinBp,
    overlapMaxBp: recommendation.optimalMaxBp,
    // SnapGene dialog default; also ≥ grading floor for Classic / HiFi (48 °C).
    overlapTargetTmC: Math.max(50, thresholds.minOverlapTmC ?? 50),
    amplifyVectorWithoutExtensions: true,
    regenerateEnzymeSites: true,
  }
}
