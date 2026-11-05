import {
  defaultConstructProperties,
  methylationForStrain,
  normalizeConstructProperties,
} from './constructProperties'
import { defaultDnaEnds, normalizeDnaEnds, type DnaEnds } from './dnaEnds'
import {
  createPcrProductRecord,
  listPcrAmplicons,
  type PcrAmplicon,
  type PcrPolymeraseMode,
  type PcrPrimerInput,
} from './pcr'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import { formatStickyEndPreview } from './restrictionCloning'
import {
  addOperation,
  complementDnaBase,
  createId,
  normalizeDna,
  nowIso,
  reverseComplement,
  sanitizeDna,
} from './sequence'
import type { ConstructProperties } from './types'
import type {
  HistoryNode,
  Primer,
  SequenceFeature,
  SequenceRecord,
} from './types'

/** AT (TA) cloning uses 3′ T-vector / A-insert; GC uses 3′ C-vector / G-insert. */
export type TaGcCloningMethod = 'ta' | 'gc'

export type TaGcVectorCatalogEntry = {
  id: string
  method: TaGcCloningMethod
  label: string
  fileName: string
  path: string
  length: number
}

export type TaGcVectorCatalog = {
  ta: TaGcVectorCatalogEntry[]
  gc: TaGcVectorCatalogEntry[]
}

export type TaGcInsertMode = 'pcr' | 'direct'

/** Polymerase modes offered for AT/GC insert PCR (SnapGene-style labels). */
export type TaGcInsertPolymerase = 'a-or-g-overhang' | 'blunt'

export type TaGcPrimerDraft = PcrPrimerInput & {
  sourcePrimerId: string | null
}

export type TaGcInsertConfig = {
  record: SequenceRecord | null
  mode: TaGcInsertMode
  orientation: 'forward' | 'reverse'
  forwardPrimer: TaGcPrimerDraft
  reversePrimer: TaGcPrimerDraft
  polymerase: TaGcInsertPolymerase
  selectedAmpliconId: string | null
  selectedRange: { start: number; end: number } | null
}

export type TaGcVectorSource = 'commercial' | 'custom'

export type TaGcVectorConfig = {
  source: TaGcVectorSource
  commercialId: string | null
  customRecord: SequenceRecord | null
}

export type ResolvedTaGcPart = {
  role: 'insert' | 'vector'
  name: string
  label: string
  color: string
  sequence: string
  features: SequenceFeature[]
  primers: Primer[]
  source: SequenceRecord
  dnaEnds: DnaEnds
  ready: boolean
  message: string
  amplicons: PcrAmplicon[]
  selectedAmplicon: PcrAmplicon | null
  /**
   * Schema sticky-end glyph when termini are polymerase overhangs rather than
   * sequence letters (SnapGene shows R for 3′ A/G overhangs).
   */
  schemaOverhangBase: string | null
}

export type TaGcOverhangInfo = {
  base: string
  complementary: string
}

export type TaGcAnalysis = {
  ready: boolean
  message: string
  method: TaGcCloningMethod
  productLength: number | null
  orientationCompatibleEitherWay: boolean
  warning: string | null
  fusedSequence: string
  /** Insert then vector spans in fusedSequence coordinates (half-open). */
  partSpans: TaGcPartSpan[]
}

export type TaGcPartSpan = {
  start: number
  end: number
  color: string
  label: string
  role: 'insert' | 'vector'
}

export const TA_GC_METHODS: TaGcCloningMethod[] = ['ta', 'gc']

export function taGcMethodLabel(method: TaGcCloningMethod) {
  return method === 'gc' ? 'GC Cloning' : 'TA Cloning'
}

export function taGcInsertColor() {
  return '#c44d4d'
}

export function taGcVectorColor() {
  return '#2f2a23'
}

export function defaultTaGcPrimerDraft(name: string): TaGcPrimerDraft {
  return {
    name,
    sequence: '',
    phosphorylated: false,
    sourcePrimerId: null,
  }
}

export function defaultTaGcInsertConfig(record: SequenceRecord | null): TaGcInsertConfig {
  return {
    record,
    mode: 'pcr',
    orientation: 'forward',
    forwardPrimer: defaultTaGcPrimerDraft('Primer 1'),
    reversePrimer: defaultTaGcPrimerDraft('Primer 2'),
    polymerase: 'a-or-g-overhang',
    selectedAmpliconId: null,
    selectedRange: null,
  }
}

export function defaultTaGcVectorConfig(): TaGcVectorConfig {
  return {
    source: 'commercial',
    commercialId: null,
    customRecord: null,
  }
}

export function polymeraseForMethod(method: TaGcCloningMethod): PcrPolymeraseMode {
  return method === 'gc' ? 'g-overhang' : 'a-overhang'
}

export function toPcrPolymerase(mode: TaGcInsertPolymerase, method: TaGcCloningMethod): PcrPolymeraseMode {
  if (mode === 'blunt') return 'blunt'
  return polymeraseForMethod(method)
}

export function fromPcrPolymerase(mode: PcrPolymeraseMode): TaGcInsertPolymerase {
  return mode === 'blunt' ? 'blunt' : 'a-or-g-overhang'
}

export function expectedInsertOverhang(method: TaGcCloningMethod): TaGcOverhangInfo {
  if (method === 'gc') return { base: 'G', complementary: 'C' }
  return { base: 'A', complementary: 'T' }
}

export function expectedVectorOverhang(method: TaGcCloningMethod): TaGcOverhangInfo {
  if (method === 'gc') return { base: 'C', complementary: 'G' }
  return { base: 'T', complementary: 'A' }
}

let catalogPromise: Promise<TaGcVectorCatalog> | null = null

export function loadTaGcVectorCatalog(): Promise<TaGcVectorCatalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(`${import.meta.env.BASE_URL}ta-gc-vectors/catalog.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load TA/GC vector catalog (${response.status})`)
        return response.json() as Promise<TaGcVectorCatalog>
      })
      .catch((error) => {
        catalogPromise = null
        throw error
      })
  }
  return catalogPromise
}

type SlimVectorJson = {
  name: string
  description?: string
  molecule?: SequenceRecord['molecule']
  topology?: SequenceRecord['topology']
  sequence: string
  features?: SequenceFeature[]
  primers?: Primer[]
  dnaEnds?: DnaEnds
  construct?: ConstructProperties
}

export async function loadTaGcCommercialVector(
  entry: TaGcVectorCatalogEntry,
): Promise<SequenceRecord> {
  const response = await fetch(`${import.meta.env.BASE_URL}${entry.path}`)
  if (!response.ok) throw new Error(`Failed to load ${entry.label}`)
  const data = (await response.json()) as SlimVectorJson
  const now = nowIso()
  return {
    id: createId('seq'),
    name: data.name || entry.label,
    description: data.description || '',
    molecule: data.molecule || 'dna',
    topology: 'linear',
    sequence: normalizeDna(data.sequence),
    features: data.features || [],
    primers: data.primers || [],
    operations: [],
    dnaEnds: normalizeDnaEnds(data.dnaEnds),
    construct: normalizeConstructProperties(data.construct ?? defaultConstructProperties),
    createdAt: now,
    updatedAt: now,
  }
}

function overhangBase(
  sequence: string,
  ends: DnaEnds,
  side: 'upstream' | 'downstream',
): string | null {
  const stickiness = ends[side].stickiness
  const abs = Math.abs(stickiness)
  if (abs <= 0 || sequence.length < abs) return null
  const slice =
    side === 'upstream' ? sequence.slice(0, abs) : sequence.slice(sequence.length - abs)
  if (stickiness < 0) {
    // 3′ overhang: display base on the protruding strand.
    // Upstream bottom / downstream top — use sequence encoding (top-strand coords).
    if (side === 'upstream') {
      // Bottom 3′ overhang base is complement of top-strand encoding.
      return slice
        .split('')
        .map((base) => complementDnaBase(base))
        .reverse()
        .join('')
        .toUpperCase()
    }
    return slice.toUpperCase()
  }
  return slice.toUpperCase()
}

export function partTerminalOverhangs(sequence: string, dnaEnds: DnaEnds) {
  const ends = normalizeDnaEnds(dnaEnds)
  return {
    upstream: overhangBase(sequence, ends, 'upstream'),
    downstream: overhangBase(sequence, ends, 'downstream'),
    upstreamStickiness: ends.upstream.stickiness,
    downstreamStickiness: ends.downstream.stickiness,
  }
}

function hasMatchingThreePrimeOverhangs(
  sequence: string,
  dnaEnds: DnaEnds,
  expectedBase: string,
) {
  const ends = normalizeDnaEnds(dnaEnds)
  if (ends.upstream.stickiness !== -1 || ends.downstream.stickiness !== -1) return false
  if (sequence.length < 2) return false
  // Stored top-strand termini for 3′ overhangs: TA vectors are A…T, GC are G…C.
  // Inserts with A overhangs are A…A; G overhangs are G…G.
  const first = sequence[0]!.toUpperCase()
  const last = sequence[sequence.length - 1]!.toUpperCase()
  if (expectedBase === 'T') return first === 'A' && last === 'T'
  if (expectedBase === 'C') return first === 'G' && last === 'C'
  if (expectedBase === 'A') return first === 'A' && last === 'A'
  if (expectedBase === 'G') return first === 'G' && last === 'G'
  return false
}

export function taGcPrimerDraftFromPrimer(primer: Primer, fallbackName: string): TaGcPrimerDraft {
  return {
    name: primer.name || fallbackName,
    sequence: primer.sequence,
    phosphorylated: false,
    sourcePrimerId: primer.id,
    color: primer.color,
  }
}

export function resolveTaGcInsert(
  config: TaGcInsertConfig,
  method: TaGcCloningMethod,
): ResolvedTaGcPart {
  const color = taGcInsertColor()
  const empty = (message: string): ResolvedTaGcPart => ({
    role: 'insert',
    name: 'Insert',
    label: 'Insert',
    color,
    sequence: '',
    features: [],
    primers: [],
    source: config.record || {
      id: 'empty',
      name: 'Insert',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: '',
      features: [],
      primers: [],
      operations: [],
      dnaEnds: defaultDnaEnds(),
      construct: defaultConstructProperties,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    dnaEnds: defaultDnaEnds(),
    ready: false,
    message,
    amplicons: [],
    selectedAmplicon: null,
    schemaOverhangBase: null,
  })

  if (!config.record) return empty('Choose an insert source.')

  if (config.mode === 'direct') {
    if (config.record.topology !== 'linear') {
      return empty('Direct insert must be a linear DNA fragment.')
    }
    const sequence =
      config.orientation === 'reverse'
        ? reverseComplement(config.record.sequence)
        : config.record.sequence
    const dnaEnds =
      config.orientation === 'reverse'
        ? {
            upstream: config.record.dnaEnds?.downstream ?? defaultDnaEnds().downstream,
            downstream: config.record.dnaEnds?.upstream ?? defaultDnaEnds().upstream,
          }
        : normalizeDnaEnds(config.record.dnaEnds)
    const expected = expectedInsertOverhang(method)
    const ok = hasMatchingThreePrimeOverhangs(sequence, dnaEnds, expected.base)
    return {
      role: 'insert',
      name: config.record.name,
      label: 'Insert',
      color,
      sequence,
      features: config.record.features,
      primers: config.record.primers,
      source: config.record,
      dnaEnds,
      ready: ok,
      message: ok
        ? `${sequence.length.toLocaleString()} bp with 3′ ${expected.base} overhangs.`
        : `Insert needs 3′ ${expected.base} overhangs for ${taGcMethodLabel(method)}.`,
      amplicons: [],
      selectedAmplicon: null,
      schemaOverhangBase: null,
    }
  }

  const pcrMode = toPcrPolymerase(config.polymerase, method)
  const forwardOk = normalizeDna(config.forwardPrimer.sequence).length > 0
  const reverseOk = normalizeDna(config.reversePrimer.sequence).length > 0
  if (!forwardOk || !reverseOk) {
    const stretch =
      config.selectedRange != null
        ? Math.max(config.selectedRange.start, config.selectedRange.end) -
          Math.min(config.selectedRange.start, config.selectedRange.end)
        : null
    return empty(
      stretch != null && stretch > 0
        ? `Insert: ${stretch.toLocaleString()} bp selected. Choose or design PCR primers.`
        : 'Select PCR primers that amplify an insert.',
    )
  }
  const amplicons = listPcrAmplicons(config.record, config.forwardPrimer, config.reversePrimer)
  const selected =
    amplicons.find((entry) => entry.id === config.selectedAmpliconId) ?? amplicons[0] ?? null
  if (!selected) {
    return {
      ...empty('Select PCR primers that amplify an insert.'),
      amplicons,
      source: config.record,
    }
  }

  const product = createPcrProductRecord({
    template: config.record,
    amplicon: selected,
    name: 'Insert',
    forwardPrimer: config.forwardPrimer,
    reversePrimer: config.reversePrimer,
    polymerase: pcrMode,
  })
  const sequence =
    config.orientation === 'reverse' ? reverseComplement(product.sequence) : product.sequence
  const productDnaEnds = product.dnaEnds ?? defaultDnaEnds()
  const dnaEnds =
    config.orientation === 'reverse'
      ? {
          upstream: productDnaEnds.downstream,
          downstream: productDnaEnds.upstream,
        }
      : productDnaEnds
  const sticky = config.polymerase === 'a-or-g-overhang'
  const ohLabel = sticky ? 'A/G (R)' : 'blunt'

  return {
    role: 'insert',
    name: config.record.name,
    label: 'Insert',
    color,
    sequence,
    features: product.features,
    primers: product.primers,
    source: config.record,
    dnaEnds,
    ready: true,
    message: `${sequence.length.toLocaleString()} bp PCR insert (${ohLabel} ends).`,
    amplicons,
    selectedAmplicon: selected,
    schemaOverhangBase: sticky ? 'R' : null,
  }
}

export function resolveTaGcVector(
  config: TaGcVectorConfig,
  method: TaGcCloningMethod,
  commercialRecord: SequenceRecord | null,
): ResolvedTaGcPart {
  const color = taGcVectorColor()
  const record = config.source === 'commercial' ? commercialRecord : config.customRecord
  const empty = (message: string): ResolvedTaGcPart => ({
    role: 'vector',
    name: 'Linearized Vector',
    label: 'Linearized Vector',
    color,
    sequence: '',
    features: [],
    primers: [],
    source: record || {
      id: 'empty-vector',
      name: 'Linearized Vector',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: '',
      features: [],
      primers: [],
      operations: [],
      dnaEnds: defaultDnaEnds(),
      construct: defaultConstructProperties,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    dnaEnds: defaultDnaEnds(),
    ready: false,
    message,
    amplicons: [],
    selectedAmplicon: null,
    schemaOverhangBase: null,
  })

  if (!record) {
    return empty(
      config.source === 'commercial'
        ? 'Choose a commercial linearized vector.'
        : 'Choose a custom linearized vector.',
    )
  }
  if (record.topology !== 'linear') {
    return empty('Custom vector must be linear (circular sequences are not accepted).')
  }

  const dnaEnds = normalizeDnaEnds(record.dnaEnds)
  const expected = expectedVectorOverhang(method)
  const ok = hasMatchingThreePrimeOverhangs(record.sequence, dnaEnds, expected.base)
  return {
    role: 'vector',
    name: record.name,
    label: 'Linearized Vector',
    color,
    sequence: record.sequence,
    features: record.features,
    primers: record.primers,
    source: record,
    dnaEnds,
    ready: ok,
    message: ok
      ? `${record.sequence.length.toLocaleString()} bp with 3′ ${expected.base} overhangs.`
      : `Vector needs 3′ ${expected.base} overhangs for ${taGcMethodLabel(method)}.`,
    amplicons: [],
    selectedAmplicon: null,
    schemaOverhangBase: null,
  }
}

function junctionTrim(left: ResolvedTaGcPart, right: ResolvedTaGcPart) {
  const leftDown = Math.abs(normalizeDnaEnds(left.dnaEnds).downstream.stickiness)
  const rightUp = Math.abs(normalizeDnaEnds(right.dnaEnds).upstream.stickiness)
  return Math.min(leftDown, rightUp, left.sequence.length, right.sequence.length)
}

/** PCR sticky inserts store the amplicon body; assembly adds method-specific A/G overhangs. */
function materializeInsertForAssembly(
  insert: ResolvedTaGcPart,
  method: TaGcCloningMethod,
): ResolvedTaGcPart {
  if (!insert.schemaOverhangBase) return insert
  const oh = expectedInsertOverhang(method).base
  return {
    ...insert,
    sequence: sanitizeDna(`${oh}${insert.sequence}${oh}`),
    schemaOverhangBase: null,
  }
}

/**
 * Fuse 3′ sticky insert + vector for TA/GC.
 *
 * Restriction-style joins trim the *left* downstream overhang and keep the *right*
 * upstream encoding — correct for 5′ overhangs. For 3′ TA/GC overhangs the top-strand
 * junction bases are the left fragment's downstream overhang and the right fragment's
 * downstream overhang (vector C / insert A or G), so we instead drop each fragment's
 * *upstream* overhang encoding:
 *   insert G…G + vector G…C  →  BODY+G + MIDDLE+C
 * That keeps the polymerase G (or A) and the vector's C (or T), instead of two G/A
 * bases that look like spurious marked overhangs around the insert.
 */
function fuseTaGcSequences(insertSeq: string, vectorSeq: string, overhangLen: number) {
  const oh = Math.max(0, Math.min(overhangLen, insertSeq.length, vectorSeq.length))
  const insertChunk = insertSeq.slice(oh)
  const vectorChunk = vectorSeq.slice(oh)
  return {
    fused: sanitizeDna(insertChunk + vectorChunk),
    insertKeep: insertChunk.length,
    vectorKeep: vectorChunk.length,
    overhangLen: oh,
  }
}

function emptyAnalysis(
  method: TaGcCloningMethod,
  message: string,
): TaGcAnalysis {
  return {
    ready: false,
    message,
    method,
    productLength: null,
    orientationCompatibleEitherWay: false,
    warning: null,
    fusedSequence: '',
    partSpans: [],
  }
}

export function analyzeTaGcAssembly(
  insert: ResolvedTaGcPart,
  vector: ResolvedTaGcPart,
  method: TaGcCloningMethod,
): TaGcAnalysis {
  if (!insert.ready || !vector.ready) {
    return emptyAnalysis(method, insert.ready ? vector.message : insert.message)
  }

  const insertEnds = normalizeDnaEnds(insert.dnaEnds)
  const vectorEnds = normalizeDnaEnds(vector.dnaEnds)
  if (
    insertEnds.upstream.stickiness === 0 &&
    insertEnds.downstream.stickiness === 0 &&
    (vectorEnds.upstream.stickiness !== 0 || vectorEnds.downstream.stickiness !== 0)
  ) {
    return emptyAnalysis(method, 'Blunt insert is incompatible with sticky-end TA/GC vectors.')
  }

  const assembledInsert = materializeInsertForAssembly(insert, method)
  const ohLen = junctionTrim(assembledInsert, vector)
  const { fused, insertKeep, vectorKeep } = fuseTaGcSequences(
    assembledInsert.sequence,
    vector.sequence,
    ohLen,
  )

  if (!fused.length) {
    return emptyAnalysis(method, 'Could not assemble insert and vector.')
  }

  return {
    ready: true,
    message: `Ready for ${taGcMethodLabel(method)}. Product: ${fused.length.toLocaleString()} bp.`,
    method,
    productLength: fused.length,
    orientationCompatibleEitherWay: true,
    warning: null,
    fusedSequence: fused,
    partSpans: [
      {
        start: 0,
        end: insertKeep,
        color: insert.color,
        label: 'Insert',
        role: 'insert',
      },
      {
        start: insertKeep,
        end: insertKeep + vectorKeep,
        color: vector.color,
        label: 'Vector',
        role: 'vector',
      },
    ],
  }
}

export function assembleTaGcProduct(input: {
  insert: ResolvedTaGcPart
  vector: ResolvedTaGcPart
  analysis: TaGcAnalysis
  productName: string
  constructOverrides?: Partial<ConstructProperties>
  /** Preview-only Vector / Insert bands on the ring ruler. */
  includePartSpans?: boolean
}): SequenceRecord {
  const { insert, vector, analysis, productName } = input
  if (!analysis.ready || !analysis.fusedSequence) {
    throw new Error(analysis.message || 'AT/GC cloning is not ready.')
  }

  const name = productName.replace(/\.dna$/i, '') || 'Cloned'
  const sequence = analysis.fusedSequence
  const assembledInsert = materializeInsertForAssembly(insert, analysis.method)
  const ohLen = junctionTrim(assembledInsert, vector)
  const { insertKeep, vectorKeep, overhangLen } = fuseTaGcSequences(
    assembledInsert.sequence,
    vector.sequence,
    ohLen,
  )

  // Insert features are on the amplicon/body coordinates (no overhang letters).
  // Direct inserts store overhang letters in-sequence, so shift past the trimmed upstream base.
  const insertSourceFeatures = insert.schemaOverhangBase
    ? insert.features
    : shiftFeaturesLeft(insert.features, overhangLen)
  const insertFeatureMax = insert.schemaOverhangBase ? insert.sequence.length : insertKeep
  const inheritedFeatures: SequenceFeature[] = [
    ...offsetFeatures(insertSourceFeatures, 0, insertFeatureMax),
    ...offsetFeatures(shiftFeaturesLeft(vector.features, overhangLen), insertKeep, vectorKeep),
  ].map((feature) => ({
    ...feature,
    // Inherited annotations stay on the feature track, not the ruler.
    mapTrack: feature.mapTrack === 'ruler' ? undefined : feature.mapTrack,
  }))
  const features: SequenceFeature[] = [...inheritedFeatures]
  if (input.includePartSpans) {
    for (const span of analysis.partSpans) {
      features.push({
        id: createId('feat'),
        name: span.label,
        type: 'misc_feature',
        color: span.color,
        mapTrack: 'ruler',
        locations: [{ start: span.start, end: span.end, strand: 'forward' }],
      })
    }
  }
  const primers = refreshExactPrimerBindings([...insert.primers, ...vector.primers], sequence)

  let record: SequenceRecord = {
    id: createId('seq'),
    name,
    description: `${taGcMethodLabel(analysis.method)} product`,
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features,
    primers,
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: normalizeConstructProperties({
      ...vector.source.construct,
      syntheticDna: true,
      hostMethylation: methylationForStrain(
        input.constructOverrides?.bacterialTransformationStrain ??
          vector.source.construct.bacterialTransformationStrain,
      ),
      ...input.constructOverrides,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const history: HistoryNode = {
    id: createId('history'),
    name: name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`,
    seqLen: sequence.length,
    circular: true,
    operation: analysis.method === 'gc' ? 'gcCloning' : 'taCloning',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: features.map((feature) => ({
      name: feature.name,
      type: feature.type,
      color: feature.color,
      strand: feature.locations[0]?.strand ?? 'forward',
      segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
    })),
    sequence,
    primers,
    children: [
      {
        id: createId('history'),
        name: insert.source.name.toLowerCase().endsWith('.dna')
          ? insert.source.name
          : `${insert.source.name}.dna`,
        seqLen: insert.source.sequence.length,
        circular: insert.source.topology === 'circular',
        operation: 'invalid',
        resurrectable: true,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        sequence: insert.source.sequence,
        primers: insert.source.primers,
        traceFiles: insert.source.traceFiles,
        children: [],
      },
      {
        id: createId('history'),
        name: vector.source.name.toLowerCase().endsWith('.dna')
          ? vector.source.name
          : `${vector.source.name}.dna`,
        seqLen: vector.source.sequence.length,
        circular: false,
        operation: 'invalid',
        resurrectable: true,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        sequence: vector.source.sequence,
        primers: vector.source.primers,
        traceFiles: vector.source.traceFiles,
        children: [],
      },
    ],
  }

  record = { ...record, history }
  return addOperation(
    record,
    analysis.method === 'gc' ? 'gc-cloning' : 'ta-cloning',
    `${taGcMethodLabel(analysis.method)}: ${insert.label} + ${vector.name}`,
  )
}

function shiftFeaturesLeft(features: SequenceFeature[], shift: number) {
  if (shift <= 0) return features
  return features
    .map((feature) => ({
      ...feature,
      locations: feature.locations
        .map((location) => ({
          ...location,
          start: Math.max(0, location.start - shift),
          end: Math.max(0, location.end - shift),
        }))
        .filter((location) => location.end > location.start),
    }))
    .filter((feature) => feature.locations.length > 0)
}

function offsetFeatures(features: SequenceFeature[], offset: number, maxLength: number) {
  return features
    .map((feature) => ({
      ...feature,
      id: createId('feature'),
      locations: feature.locations
        .map((location) => ({
          ...location,
          start: Math.min(location.start, maxLength) + offset,
          end: Math.min(location.end, maxLength) + offset,
        }))
        .filter((location) => location.end > location.start),
    }))
    .filter((feature) => feature.locations.length > 0)
}

export function taGcPreviewRecord(
  analysis: TaGcAnalysis,
  insert: ResolvedTaGcPart,
  vector: ResolvedTaGcPart,
): SequenceRecord | null {
  if (!analysis.ready || !analysis.fusedSequence) return null
  try {
    return {
      ...assembleTaGcProduct({
        insert,
        vector,
        analysis,
        productName: 'Cloned',
        includePartSpans: true,
      }),
      id: 'ta-gc-preview',
      description: `${taGcMethodLabel(analysis.method)} preview`,
    }
  } catch {
    return null
  }
}

export function formatTaGcStickyPreview(
  part: ResolvedTaGcPart,
  side: 'upstream' | 'downstream',
  contextBases = 6,
) {
  // The schema glyph describes the protruding strand itself, whereas the
  // shared formatter expects the corresponding top-strand bases.
  const overhang = part.schemaOverhangBase && side === 'upstream' && part.dnaEnds.upstream.stickiness < 0
    ? complementDna(part.schemaOverhangBase)
    : part.schemaOverhangBase
  return formatStickyEndPreview(
    part.sequence,
    part.dnaEnds,
    side,
    contextBases,
    overhang,
  )
}

export type TaGcJunctionGlyph = {
  char: string
  role: 'vector' | 'insert' | 'spacer'
}

export type TaGcJunctionStrandPreview = {
  top: TaGcJunctionGlyph[]
  bottom: TaGcJunctionGlyph[]
}

export type TaGcJunctionPreview = {
  left: TaGcJunctionStrandPreview
  right: TaGcJunctionStrandPreview
}

function circularSlice(sequence: string, start: number, length: number): string {
  const len = sequence.length
  if (len <= 0 || length <= 0) return ''
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += sequence[((start + i) % len + len) % len]!
  }
  return out
}

/**
 * SnapGene-style duplex snippets at both insert↔vector junctions.
 * Strands are 5′→3′ left-to-right and length-aligned. Insert bases render
 * lowercase on a pink role; vector stays uppercase. For 3′ sticky products the
 * bottom-strand insert highlight is staggered by one base (overhang geometry).
 */
export function formatTaGcProductJunctions(
  fusedSequence: string,
  insertEnd: number,
  options?: { contextBases?: number; overhangLen?: number },
): TaGcJunctionPreview | null {
  const sequence = sanitizeDna(fusedSequence)
  const len = sequence.length
  if (!len || insertEnd <= 0 || insertEnd >= len) return null

  const context = Math.max(3, Math.min(options?.contextBases ?? 6, 12))
  const oh = Math.max(0, Math.min(options?.overhangLen ?? 1, context - 1))

  // Insert occupies [0, insertEnd); vector the rest. Left junction is at 0.
  const leftVectorSeq = circularSlice(sequence, len - context, context).toUpperCase()
  const leftInsertSeq = circularSlice(sequence, 0, context)
  const rightInsertSeq = circularSlice(sequence, insertEnd - context, context)
  const rightVectorSeq = circularSlice(sequence, insertEnd, context).toUpperCase()

  const ellipsis: TaGcJunctionGlyph[] = [
    { char: '.', role: 'spacer' },
    { char: '.', role: 'spacer' },
    { char: '.', role: 'spacer' },
  ]

  function sideGlyphs(args: {
    vector: string
    insert: string
    side: 'left' | 'right'
    stagger: boolean
    insertCase: 'upper' | 'lower'
  }): TaGcJunctionGlyph[] {
    const vec = args.vector.toUpperCase().split('')
    const ins = (
      args.insertCase === 'upper' ? args.insert.toUpperCase() : args.insert.toLowerCase()
    ).split('')

    const insertGlyphs = ins.map((char, index) => {
      const recessed =
        args.stagger &&
        ((args.side === 'left' && index < oh) ||
          (args.side === 'right' && index >= ins.length - oh))
      return { char, role: recessed ? ('vector' as const) : ('insert' as const) }
    })

    const body =
      args.side === 'left'
        ? [...vec.map((char) => ({ char, role: 'vector' as const })), ...insertGlyphs]
        : [...insertGlyphs, ...vec.map((char) => ({ char, role: 'vector' as const }))]
    return [...ellipsis, ...body, ...ellipsis]
  }

  return {
    left: {
      top: sideGlyphs({
        vector: leftVectorSeq,
        insert: leftInsertSeq,
        side: 'left',
        stagger: false,
        insertCase: 'upper',
      }),
      bottom: sideGlyphs({
        vector: complementDna(leftVectorSeq),
        insert: complementDna(leftInsertSeq),
        side: 'left',
        stagger: oh > 0,
        insertCase: 'upper',
      }),
    },
    right: {
      top: sideGlyphs({
        vector: rightVectorSeq,
        insert: rightInsertSeq,
        side: 'right',
        stagger: false,
        insertCase: 'lower',
      }),
      bottom: sideGlyphs({
        vector: complementDna(rightVectorSeq),
        insert: complementDna(rightInsertSeq),
        side: 'right',
        stagger: oh > 0,
        insertCase: 'lower',
      }),
    },
  }
}

function complementDna(sequence: string) {
  return sequence
    .split('')
    .map((base) => complementDnaBase(base))
    .join('')
}
