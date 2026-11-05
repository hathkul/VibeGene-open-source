import {
  defaultConstructProperties,
  methylationForStrain,
  normalizeConstructProperties,
} from './constructProperties'
import { defaultDnaEnds, normalizeDnaEnds } from './dnaEnds'
import {
  createPcrProductRecord,
  listPcrAmplicons,
  type PcrAmplicon,
  type PcrPrimerInput,
} from './pcr'
import { serializeFeatureQualifiers } from './featureQualifiers'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import {
  addOperation,
  createId,
  normalizeDna,
  nowIso,
  reverseComplement,
  rotateCircularSequence,
  sanitizeDna,
} from './sequence'
import type { ConstructProperties, Primer, SequenceFeature, SequenceRecord } from './types'

/** Gateway modalities. BP and LR are both supported. */
export type GatewayCloningMethod = 'bp' | 'lr'

export type GatewayVectorCatalogEntry = {
  id: string
  kind: 'donor' | 'destination'
  label: string
  fileName: string
  path: string
  length: number
}

export type GatewayVectorCatalog = {
  donor: GatewayVectorCatalogEntry[]
  destination?: GatewayVectorCatalogEntry[]
}

/** Max Multisite entry clones in one LR reaction (SnapGene limit). */
export const MAX_GATEWAY_LR_ENTRIES = 4

export type GatewayEntryConfig = {
  record: SequenceRecord | null
}

export type GatewayInsertMode = 'pcr' | 'direct'

export type GatewayPrimerDraft = PcrPrimerInput & {
  sourcePrimerId: string | null
}

export type GatewayInsertConfig = {
  record: SequenceRecord | null
  mode: GatewayInsertMode
  /**
   * Relative to donor-derived attB left/right subtypes:
   * forward = left → insert → right; reverse = right ← insert ← left.
   */
  siteOrientation: 'forward' | 'reverse'
  /** attB subtypes pairing with the donor attP sites (e.g. "1"/"2" or "1"/"4"). */
  attBLeftSubtype: string
  attBRightSubtype: string
  forwardPrimer: GatewayPrimerDraft
  reversePrimer: GatewayPrimerDraft
  selectedAmpliconId: string | null
  selectedRange: { start: number; end: number } | null
  useAdapterPrimers: boolean
}

export type GatewayVectorSource = 'standard' | 'custom'

export type GatewayVectorConfig = {
  source: GatewayVectorSource
  standardId: string | null
  customRecord: SequenceRecord | null
}

export type AttSiteKind = 'B' | 'P' | 'L' | 'R'

export type AttSiteHit = {
  kind: AttSiteKind
  /** Site subtype, e.g. "1", "2", "4r". */
  subtype: string
  name: string
  /** Inclusive-exclusive half-open interval on the top strand. */
  start: number
  end: number
  /** Direction of the site motif as annotated / matched. */
  strand: 'forward' | 'reverse'
  /** Motif sequence written 5′→3′ in its functional orientation. */
  motif: string
  source: 'feature' | 'sequence'
}

export type ResolvedGatewayInsert = {
  role: 'insert'
  name: string
  label: string
  color: string
  sequence: string
  features: SequenceFeature[]
  primers: Primer[]
  source: SequenceRecord
  ready: boolean
  message: string
  amplicons: PcrAmplicon[]
  selectedAmplicon: PcrAmplicon | null
  /** attB sites on the resolved linear insert (product coordinates). */
  attSites: AttSiteHit[]
}

export type ResolvedGatewayDonor = {
  role: 'donor'
  name: string
  label: string
  color: string
  sequence: string
  features: SequenceFeature[]
  primers: Primer[]
  source: SequenceRecord
  ready: boolean
  message: string
  attSites: AttSiteHit[]
}

export type ResolvedGatewayEntry = {
  role: 'entry'
  name: string
  label: string
  color: string
  sequence: string
  features: SequenceFeature[]
  primers: Primer[]
  source: SequenceRecord
  ready: boolean
  message: string
  attSites: AttSiteHit[]
  left: AttSiteHit | null
  right: AttSiteHit | null
}

export type ResolvedGatewayDestination = {
  role: 'destination'
  name: string
  label: string
  color: string
  sequence: string
  features: SequenceFeature[]
  primers: Primer[]
  source: SequenceRecord
  ready: boolean
  message: string
  attSites: AttSiteHit[]
  left: AttSiteHit | null
  right: AttSiteHit | null
}

export type GatewayPartSpan = {
  start: number
  end: number
  color: string
  label: string
  role: 'insert' | 'donor' | 'attL' | 'attR'
}

export type GatewayAnalysis = {
  ready: boolean
  message: string
  method: GatewayCloningMethod
  productLength: number | null
  warning: string | null
  sequence: string
  features: SequenceFeature[]
  partSpans: GatewayPartSpan[]
  leftSite: string | null
  rightSite: string | null
}

export const GATEWAY_METHODS: GatewayCloningMethod[] = ['bp', 'lr']

/** Canonical Gateway attB motifs (Thermo / SnapGene). Keys are site numbers without "attB". */
export const ATTB_MOTIFS: Record<string, string> = {
  '1': 'GGGGACAAGTTTGTACAAAAAAGCAGGCT',
  '2': 'GGGGACCACTTTGTACAAGAAAGCTGGGT',
  '3': 'GGGGACAAGTTTGTATAATAAAGTTG',
  '4': 'GGGGACAACTTTGTATAGAAAAGTTG',
  '5': 'GGGGACAACTTTGTATACAAAAGTTG',
}

/** Truncated attB tails used with adapter primers (SnapGene-style). */
export const ATTB_ADAPTER_TAILS: Record<string, string> = {
  '1': 'AAAAAGCAGGCT',
  '2': 'AGAAAGCTGGGT',
  '3': 'AAAAAAGTTG',
  '4': 'ATAGAAAAGTTG',
  '5': 'ATACAAAAGTTG',
}

/** Resolve attB oligo motif for a subtype such as "1", "4", or "5r". */
export function resolveAttBMotif(subtype: string, useAdapterPrimers = false): string {
  const key = subtype.trim().toLowerCase()
  const base = key.replace(/r$/i, '') || '1'
  if (useAdapterPrimers) {
    return ATTB_ADAPTER_TAILS[key] || ATTB_ADAPTER_TAILS[base] || ATTB_ADAPTER_TAILS['1']!
  }
  return ATTB_MOTIFS[key] || ATTB_MOTIFS[base] || ATTB_MOTIFS['1']!
}

export function formatAttBSiteLabel(subtype: string) {
  const key = subtype.trim() || '1'
  return /^attb/i.test(key) ? key : `attB${key}`
}

/**
 * Parse MultiSite donor labels such as "pDONR221 P1-P5r" → ["1", "5r"].
 * SnapGene often annotates both sites without the "r" suffix; the plasmid name is authoritative.
 */
export function parseNamedAttPPair(label: string): [string, string] | null {
  const match = /\bP(\d+r?)\s*[-–—]\s*P(\d+r?)\b/i.exec(label)
  if (!match) return null
  return [match[1]!.toLowerCase(), match[2]!.toLowerCase()]
}

/** BP product site from a donor attP subtype: P5r → attR5, P1 → attL1. */
export function bpProductSiteLabel(pSubtype: string): string {
  const key = pSubtype.trim().toLowerCase()
  const base = key.replace(/r$/i, '') || '1'
  return /r$/i.test(key) ? `attR${base}` : `attL${base}`
}

function attSiteRole(label: string): 'attL' | 'attR' {
  return /^attR/i.test(label) ? 'attR' : 'attL'
}

/**
 * SnapGene Gateway feature qualifiers required for LR recognition.
 * Values match Addgene / SnapGene-native HTML bodies (plain text without the `<html>` wrapper);
 * SnapGene export wraps them for Feature Q tags.
 */
export function gatewayLrRecombinationNotes(attKind: 'L' | 'R'): string {
  return serializeFeatureQualifiers({
    // Order matches SnapGene/Addgene Feature Q emission: bound_moiety, gene, note.
    bound_moiety: 'LR Clonase™',
    gene: `mutant version of att${attKind}`,
    note: 'recombination site for the Gateway® LR reaction',
  })
}

function notesForBpProductSite(siteName: string): string {
  const kind = /^attR/i.test(siteName) ? 'R' : 'L'
  return gatewayLrRecombinationNotes(kind)
}

/**
 * Apply "r" orientation from the donor name onto annotated attP sites
 * (e.g. features attP1/attP5 + name P1-P5r → subtypes 1/5r, names attP1/attP5r).
 */
export function applyNamedAttPSubtypes(sites: AttSiteHit[], donorLabel: string): AttSiteHit[] {
  const named = parseNamedAttPPair(donorLabel)
  if (!named) return sites
  const byBase = new Map(named.map((subtype) => [subtype.replace(/r$/i, ''), subtype]))
  return sites.map((site) => {
    if (site.kind !== 'P') return site
    const base = site.subtype.replace(/r$/i, '')
    const corrected = byBase.get(base)
    if (!corrected || corrected === site.subtype) return site
    return {
      ...site,
      subtype: corrected,
      name: `attP${corrected}`,
    }
  })
}

/**
 * attB subtypes for primer design that match the donor's attP pair
 * (e.g. attP1/attP4 → B1/B4, attP2r/attP3 → B2r/B3).
 */
export function attBPrimerSubtypesFromDonor(donor: {
  ready: boolean
  attSites: AttSiteHit[]
}): { left: string; right: string; leftName: string; rightName: string } {
  const pair = pickDonorAttPair(donor.attSites)
  if (!pair || !donor.ready) {
    return { left: '1', right: '2', leftName: 'attB1', rightName: 'attB2' }
  }
  return {
    left: pair.left.subtype,
    right: pair.right.subtype,
    leftName: formatAttBSiteLabel(pair.left.subtype),
    rightName: formatAttBSiteLabel(pair.right.subtype),
  }
}

export function gatewayMethodLabel(method: GatewayCloningMethod) {
  return method === 'lr' ? 'LR Cloning' : 'BP Cloning'
}

export function gatewayInsertColor() {
  return '#c44d4d'
}

export function gatewayDonorColor() {
  return '#2f2a23'
}

export function gatewayDestinationColor() {
  return '#2f2a23'
}

export function gatewayEntryColor(index = 0) {
  // High-contrast SnapGene-like palette so multi-insert product arcs stay distinct.
  const palette = ['#d62828', '#1d4ed8', '#15803d', '#ea580c']
  return palette[index % palette.length]!
}

export function defaultGatewayEntryConfig(record: SequenceRecord | null = null): GatewayEntryConfig {
  return { record }
}

export function preferDefaultDestinationId(list: GatewayVectorCatalogEntry[]): string | null {
  if (!list.length) return null
  const prefer = [
    /pcDNA.*6\.2.*C-YFP-DEST/i,
    /pcDNA.*DEST40/i,
    /pDEST14/i,
    /pDEST17/i,
  ]
  for (const pattern of prefer) {
    const hit = list.find((entry) => pattern.test(entry.label) || pattern.test(entry.id))
    if (hit) return hit.id
  }
  return list[0]?.id ?? null
}

export function defaultGatewayPrimerDraft(name: string): GatewayPrimerDraft {
  return {
    name,
    sequence: '',
    phosphorylated: false,
    sourcePrimerId: null,
  }
}

export function defaultGatewayInsertConfig(
  record: SequenceRecord | null,
  options?: { selectedRange?: { start: number; end: number } | null },
): GatewayInsertConfig {
  return {
    record,
    mode: 'pcr',
    siteOrientation: 'forward',
    attBLeftSubtype: '1',
    attBRightSubtype: '2',
    forwardPrimer: defaultGatewayPrimerDraft('Primer 1'),
    reversePrimer: defaultGatewayPrimerDraft('Primer 2'),
    selectedAmpliconId: null,
    selectedRange: options?.selectedRange ?? null,
    useAdapterPrimers: false,
  }
}

export function defaultGatewayVectorConfig(): GatewayVectorConfig {
  return {
    source: 'standard',
    standardId: null,
    customRecord: null,
  }
}

export function gatewayPrimerDraftFromPrimer(primer: Primer, fallbackName: string): GatewayPrimerDraft {
  return {
    name: primer.name || fallbackName,
    sequence: normalizeDna(primer.sequence),
    phosphorylated: false,
    sourcePrimerId: primer.id,
    color: primer.color,
  }
}

let catalogPromise: Promise<GatewayVectorCatalog> | null = null

export function loadGatewayVectorCatalog(): Promise<GatewayVectorCatalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(`${import.meta.env.BASE_URL}gateway-vectors/catalog.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load Gateway vector catalog (${response.status})`)
        return response.json() as Promise<GatewayVectorCatalog>
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
  dnaEnds?: SequenceRecord['dnaEnds']
  construct?: ConstructProperties
}

export async function loadGatewayStandardVector(
  entry: GatewayVectorCatalogEntry,
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
    topology: data.topology || 'circular',
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

function parseAttFeatureName(name: string): { kind: AttSiteKind; subtype: string } | null {
  const match = /^(att)([BPLR])(\d+r?)$/i.exec(name.trim())
  if (!match) return null
  const kind = match[2]!.toUpperCase() as AttSiteKind
  const subtype = match[3]!.toLowerCase()
  return { kind, subtype }
}

function emptyInsert(message: string, source?: SequenceRecord | null): ResolvedGatewayInsert {
  return {
    role: 'insert',
    name: 'attB Insert',
    label: 'attB Insert',
    color: gatewayInsertColor(),
    sequence: '',
    features: [],
    primers: [],
    source: source || {
      id: 'empty-insert',
      name: 'attB Insert',
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
    ready: false,
    message,
    amplicons: [],
    selectedAmplicon: null,
    attSites: [],
  }
}

function emptyDonor(message: string, source?: SequenceRecord | null): ResolvedGatewayDonor {
  return {
    role: 'donor',
    name: 'Donor Vector',
    label: 'Donor Vector',
    color: gatewayDonorColor(),
    sequence: '',
    features: [],
    primers: [],
    source: source || {
      id: 'empty-donor',
      name: 'Donor Vector',
      description: '',
      molecule: 'dna',
      topology: 'circular',
      sequence: '',
      features: [],
      primers: [],
      operations: [],
      dnaEnds: defaultDnaEnds(),
      construct: defaultConstructProperties,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    ready: false,
    message,
    attSites: [],
  }
}

/** Find att sites from annotations, falling back to canonical motif scan for attB. */
export function findAttSites(
  record: SequenceRecord,
  kinds: AttSiteKind[] = ['B', 'P'],
): AttSiteHit[] {
  const hits: AttSiteHit[] = []
  const kindSet = new Set(kinds)

  for (const feature of record.features) {
    const parsed = parseAttFeatureName(feature.name)
    if (!parsed || !kindSet.has(parsed.kind)) continue
    for (const location of feature.locations) {
      const motif =
        location.strand === 'reverse'
          ? reverseComplement(record.sequence.slice(location.start, location.end))
          : record.sequence.slice(location.start, location.end)
      hits.push({
        kind: parsed.kind,
        subtype: parsed.subtype,
        name: feature.name,
        start: location.start,
        end: location.end,
        strand: location.strand,
        motif: normalizeDna(motif),
        source: 'feature',
      })
    }
  }

  if (kindSet.has('B')) {
    const sequence = normalizeDna(record.sequence)
    for (const [subtype, motif] of Object.entries(ATTB_MOTIFS)) {
      for (const strand of ['forward', 'reverse'] as const) {
        const needle = strand === 'forward' ? motif : reverseComplement(motif)
        let from = 0
        while (from < sequence.length) {
          const index = sequence.indexOf(needle, from)
          if (index < 0) break
          const already = hits.some(
            (hit) => hit.kind === 'B' && hit.start === index && hit.end === index + needle.length,
          )
          if (!already) {
            hits.push({
              kind: 'B',
              subtype,
              name: `attB${subtype}`,
              start: index,
              end: index + needle.length,
              strand,
              motif,
              source: 'sequence',
            })
          }
          from = index + 1
        }
      }
    }
  }

  return hits.sort((a, b) => a.start - b.start || a.end - b.end)
}

function longestCommonSubstring(a: string, b: string): { aIndex: number; bIndex: number; length: number } | null {
  let best: { aIndex: number; bIndex: number; length: number } | null = null
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let len = 0
      while (i + len < a.length && j + len < b.length && a[i + len] === b[j + len]) len += 1
      if (len >= 12 && (!best || len > best.length)) {
        best = { aIndex: i, bIndex: j, length: len }
      }
    }
  }
  return best
}

/**
 * Thermo/SnapGene attR core prefixes inside attP (prefer longer matches).
 * Used when B and P disagree at the polymorphic base before the common core
 * (e.g. attB3 has …AGTTT… while attP3 has …ACTTT…), so raw B∩P LCS would
 * start too late and drop the bases SnapGene needs for attR recognition.
 */
const ATTR_CORE_PREFIXES: Record<string, string[]> = {
  '1': ['CAACTTTGTACAAAAAAGC', 'AACTTTGTACAAAAAAGC'],
  '2': ['CAACTTTGTACAAGAAAGCTG', 'AACTTTGTACAAGAAAGCTG'],
  '3': ['CCAACTTTGTATAATAAAGTTG', 'CAACTTTGTATAATAAAGTTG'],
  '4': ['CCAACTTTGTATAGAAAAGTTG', 'CAACTTTGTATAGAAAAGTTG'],
  '5': ['CAACTTTGTATACAAAAGTTG'],
}

/** SnapGene-style annotated attR length (bp) on MultiSite entry clones. */
const ATTR_ANNOTATION_LENGTH = 124

/**
 * Crossover index offsets into each motif.
 *
 * Default: start of the longest B∩P shared stretch (≥12 bp).
 * For reverse-orientation ("r") attP sites that become attR, prefer the Thermo
 * attR core start inside attP so polymorphic B bases do not truncate the site.
 */
function crossoverOffsets(
  attBMotif: string,
  attPMotif: string,
  pSubtype = '',
): { bOffset: number; pOffset: number; sharedLength: number } | null {
  const b = normalizeDna(attBMotif)
  const p = normalizeDna(attPMotif)
  const shared = longestCommonSubstring(b, p)
  if (!shared) return null

  const bOffset = shared.aIndex
  let pOffset = shared.bIndex

  if (/r$/i.test(pSubtype)) {
    const base = pSubtype.replace(/r$/i, '') || ''
    for (const core of ATTR_CORE_PREFIXES[base] || []) {
      const idx = p.indexOf(normalizeDna(core))
      if (idx >= 0) {
        pOffset = idx
        break
      }
    }
  }

  return {
    bOffset,
    pOffset,
    sharedLength: shared.length,
  }
}

/** Build the functional 5′→3′ sequence SnapGene expects for a BP product site. */
function productSiteChimera(
  pMotif: string,
  bMotif: string,
  xo: { bOffset: number; pOffset: number },
  pSubtype: string,
): string {
  if (/r$/i.test(pSubtype)) {
    return sanitizeDna(pMotif.slice(xo.pOffset, xo.pOffset + ATTR_ANNOTATION_LENGTH))
  }
  return sanitizeDna(pMotif.slice(0, xo.pOffset) + bMotif.slice(xo.bOffset))
}

function pickDonorAttPair(sites: AttSiteHit[]): { left: AttSiteHit; right: AttSiteHit } | null {
  const attP = sites.filter((site) => site.kind === 'P')
  if (attP.length < 2) return null
  // Prefer canonical attP1 / attP2 when present.
  const preferred =
    attP.find((site) => site.subtype === '1') && attP.find((site) => site.subtype === '2')
      ? ([
          attP.find((site) => site.subtype === '1')!,
          attP.find((site) => site.subtype === '2')!,
        ] as const)
      : null
  if (preferred) {
    const [a, b] = preferred
    return a.start <= b.start ? { left: a, right: b } : { left: b, right: a }
  }
  const sorted = [...attP].sort((a, b) => a.start - b.start)
  return { left: sorted[0]!, right: sorted[1]! }
}

function matchingAttB(
  sites: AttSiteHit[],
  subtype: string,
): AttSiteHit | null {
  const exact = sites.find((site) => site.kind === 'B' && site.subtype === subtype)
  if (exact) return exact
  // Map reversed P (e.g. 1r) to B subtype 1r if present, else plain number.
  const base = subtype.replace(/r$/i, '')
  return sites.find((site) => site.kind === 'B' && site.subtype.replace(/r$/i, '') === base) ?? null
}

export function resolveGatewayInsert(config: GatewayInsertConfig): ResolvedGatewayInsert {
  if (!config.record) return emptyInsert('Choose an attB insert source.')

  if (config.mode === 'direct') {
    const sequence = normalizeDna(config.record.sequence)
    if (!sequence) return emptyInsert('Choose an attB insert source.', config.record)
    const attSites = findAttSites(
      { ...config.record, sequence, topology: 'linear' },
      ['B'],
    )
    const ready = attSites.length >= 2
    return {
      role: 'insert',
      name: config.record.name,
      label: 'attB Insert',
      color: gatewayInsertColor(),
      sequence,
      features: config.record.features,
      primers: config.record.primers,
      source: config.record,
      ready,
      message: ready
        ? `${sequence.length.toLocaleString()} bp with ${attSites.map((s) => s.name).join(' / ')}.`
        : 'Direct insert must already contain a pair of attB sites.',
      amplicons: [],
      selectedAmplicon: null,
      attSites,
    }
  }

  const forwardOk = normalizeDna(config.forwardPrimer.sequence).length > 0
  const reverseOk = normalizeDna(config.reversePrimer.sequence).length > 0
  if (!forwardOk || !reverseOk) {
    const stretch =
      config.selectedRange != null
        ? Math.max(config.selectedRange.start, config.selectedRange.end) -
          Math.min(config.selectedRange.start, config.selectedRange.end)
        : null
    return emptyInsert(
      stretch != null && stretch > 0
        ? `Insert: ${stretch.toLocaleString()} bp selected. Choose or design attB PCR primers.`
        : 'Select PCR primers that add attB sites, or design them on the Product tab.',
      config.record,
    )
  }

  const amplicons = listPcrAmplicons(config.record, config.forwardPrimer, config.reversePrimer)
  const selected =
    amplicons.find((entry) => entry.id === config.selectedAmpliconId) ?? amplicons[0] ?? null
  if (!selected) {
    return {
      ...emptyInsert('Select PCR primers that amplify an attB insert.', config.record),
      amplicons,
      source: config.record,
    }
  }

  const product = createPcrProductRecord({
    template: config.record,
    amplicon: selected,
    name: 'attB Insert',
    forwardPrimer: config.forwardPrimer,
    reversePrimer: config.reversePrimer,
    polymerase: 'blunt',
  })
  // When adapter primers are used, first-round products have truncated attB tails.
  // Expand to full attB motifs so the BP substrate matches a completed adapter PCR.
  const fivePrimeSubtype =
    config.siteOrientation === 'forward' ? config.attBLeftSubtype : config.attBRightSubtype
  const threePrimeSubtype =
    config.siteOrientation === 'forward' ? config.attBRightSubtype : config.attBLeftSubtype
  const resolvedProduct = config.useAdapterPrimers
    ? expandAdapterAttBProduct(product, fivePrimeSubtype, threePrimeSubtype)
    : product
  const attSites = findAttSites(resolvedProduct, ['B'])
  const ready = attSites.length >= 2
  return {
    role: 'insert',
    name: config.record.name,
    label: 'attB Insert',
    color: gatewayInsertColor(),
    sequence: resolvedProduct.sequence,
    features: resolvedProduct.features,
    primers: resolvedProduct.primers,
    source: config.record,
    ready,
    message: ready
      ? `${resolvedProduct.sequence.length.toLocaleString()} bp PCR attB insert (${attSites
          .map((s) => s.name)
          .join(' / ')}).`
      : `${resolvedProduct.sequence.length.toLocaleString()} bp PCR product lacks a detectable attB pair.`,
    amplicons,
    selectedAmplicon: selected,
    attSites,
  }
}

/** Expand truncated adapter-tail ends to full attB motifs for the chosen site pair. */
function expandAdapterAttBProduct(
  product: SequenceRecord,
  fivePrimeSubtype: string,
  threePrimeSubtype: string,
): SequenceRecord {
  const left = resolveAttBMotif(fivePrimeSubtype, false)
  const right = resolveAttBMotif(threePrimeSubtype, false)
  const leftTail = resolveAttBMotif(fivePrimeSubtype, true)
  const rightTail = resolveAttBMotif(threePrimeSubtype, true)
  let sequence = normalizeDna(product.sequence)
  // Strip existing partial tails if present, then attach full motifs.
  if (sequence.startsWith(leftTail)) sequence = sequence.slice(leftTail.length)
  const rightRc = reverseComplement(rightTail)
  if (sequence.endsWith(rightRc)) sequence = sequence.slice(0, sequence.length - rightRc.length)
  sequence = sanitizeDna(left + sequence + reverseComplement(right))
  return {
    ...product,
    sequence,
    primers: refreshExactPrimerBindings(product.primers, sequence),
  }
}

export function resolveGatewayDonor(
  config: GatewayVectorConfig,
  standardRecord: SequenceRecord | null,
): ResolvedGatewayDonor {
  const record = config.source === 'standard' ? standardRecord : config.customRecord
  if (!record) {
    return emptyDonor(
      config.source === 'standard' ? 'Choose a standard donor vector.' : 'Choose a custom donor vector.',
    )
  }
  const sequence = normalizeDna(record.sequence)
  const attSites = applyNamedAttPSubtypes(findAttSites({ ...record, sequence }, ['P']), record.name)
  const pair = pickDonorAttPair(attSites)
  const ready = Boolean(pair)
  return {
    role: 'donor',
    name: record.name,
    label: 'Donor Vector',
    color: gatewayDonorColor(),
    sequence,
    features: record.features,
    primers: record.primers,
    source: record,
    ready,
    message: ready
      ? `${sequence.length.toLocaleString()} bp · ${pair!.left.name} / ${pair!.right.name}`
      : 'Donor vector needs a pair of attP recombination sites.',
    attSites,
  }
}

function emptyAnalysis(method: GatewayCloningMethod, message: string): GatewayAnalysis {
  return {
    ready: false,
    message,
    method,
    productLength: null,
    warning: null,
    sequence: '',
    features: [],
    partSpans: [],
    leftSite: null,
    rightSite: null,
  }
}

function functionalTopMotif(site: AttSiteHit, sequence: string) {
  const top = sequence.slice(site.start, site.end)
  return site.strand === 'reverse' ? reverseComplement(top) : normalizeDna(top)
}

function absoluteCrossoverOnTop(
  site: AttSiteHit,
  motifOffset: number,
): number {
  // motifOffset is into the functional 5′→3′ motif.
  if (site.strand === 'forward') return site.start + motifOffset
  // Reverse feature: functional 5′ is at site.end on the top strand.
  return site.end - motifOffset
}

/**
 * BP reaction: attB × attP → entry clone (ccdB cassette replaced by insert).
 * Non-"r" sites yield attL; reverse-orientation ("r") sites yield attR
 * (e.g. attB1×attP1 → attL1, attB5r×attP5r → attR5).
 *
 * Product geometry (circular top strand):
 *   donor backbone from the downstream crossover around to the upstream crossover
 *   + insert DNA between the two attB crossovers.
 *
 * We do NOT rebuild chimeric motifs by string joins of full parent sites — that
 * inverted attL/attR polarity and produced sequences SnapGene cannot use for LR.
 */
export function analyzeGatewayBpAssembly(
  insert: ResolvedGatewayInsert,
  donor: ResolvedGatewayDonor,
): GatewayAnalysis {
  if (!insert.ready) return emptyAnalysis('bp', insert.message)
  if (!donor.ready) return emptyAnalysis('bp', donor.message)

  const pair = pickDonorAttPair(donor.attSites)
  if (!pair) return emptyAnalysis('bp', 'Donor vector needs a pair of attP recombination sites.')

  const leftB = matchingAttB(insert.attSites, pair.left.subtype)
  const rightB = matchingAttB(insert.attSites, pair.right.subtype)
  if (!leftB || !rightB) {
    return emptyAnalysis(
      'bp',
      `attB insert needs ${formatAttBSiteLabel(pair.left.subtype)} and ${formatAttBSiteLabel(pair.right.subtype)} to match the donor.`,
    )
  }

  // Ensure leftB is upstream of rightB on the linear insert; flip if needed.
  let bUpstream = leftB
  let bDownstream = rightB
  let pUpstream = pair.left
  let pDownstream = pair.right
  if (bUpstream.start > bDownstream.start) {
    bUpstream = rightB
    bDownstream = leftB
    pUpstream = pair.right
    pDownstream = pair.left
  }

  const pUpMotif = functionalTopMotif(pUpstream, donor.sequence)
  const pDownMotif = functionalTopMotif(pDownstream, donor.sequence)
  const bUpMotif = functionalTopMotif(bUpstream, insert.sequence)
  const bDownMotif = functionalTopMotif(bDownstream, insert.sequence)

  const xoUp = crossoverOffsets(bUpMotif, pUpMotif, pUpstream.subtype)
  const xoDown = crossoverOffsets(bDownMotif, pDownMotif, pDownstream.subtype)
  if (!xoUp || !xoDown) {
    return emptyAnalysis('bp', 'Could not align attB and attP cores for recombination.')
  }

  let bUpCut = absoluteCrossoverOnTop(bUpstream, xoUp.bOffset)
  let bDownCut = absoluteCrossoverOnTop(bDownstream, xoDown.bOffset)
  const pUpCut = absoluteCrossoverOnTop(pUpstream, xoUp.pOffset)
  const pDownCut = absoluteCrossoverOnTop(pDownstream, xoDown.pOffset)

  // attR products (SnapGene / Thermo Multisite): the gene abuts attR with no
  // residual attB DNA. Keep B crossover cuts for attL, but for "r" sites exclude
  // the entire attB motif from the payload (gene-proximal edge of each attB).
  if (/r$/i.test(pUpstream.subtype)) {
    bUpCut = bUpstream.end
  }
  if (/r$/i.test(pDownstream.subtype)) {
    bDownCut = bDownstream.start
  }

  if (bDownCut <= bUpCut) {
    return emptyAnalysis('bp', 'attB sites on the insert are in an unexpected order.')
  }

  const payload = insert.sequence.slice(bUpCut, bDownCut)

  // Donor backbone: from pDownCut around the circle (away from cassette) to pUpCut.
  let backbone: string
  if (pUpCut < pDownCut) {
    backbone = donor.sequence.slice(pDownCut) + donor.sequence.slice(0, pUpCut)
  } else {
    backbone = donor.sequence.slice(pDownCut, pUpCut)
  }

  const sequenceRaw = sanitizeDna(backbone + payload)
  const backboneLen = backbone.length
  const payloadLen = payload.length
  const leftSite = bpProductSiteLabel(pUpstream.subtype)
  const rightSite = bpProductSiteLabel(pDownstream.subtype)

  // Functional chimeras (5′→3′) used to locate annotation spans on the product.
  const leftChimera = productSiteChimera(pUpMotif, bUpMotif, xoUp, pUpstream.subtype)
  const rightChimera = productSiteChimera(pDownMotif, bDownMotif, xoDown, pDownstream.subtype)

  // Layout is backbone+payload, so the downstream site often wraps the origin. Rotate
  // so both recombination sites are contiguous linear spans (what SnapGene expects).
  const { sequence, offset: rotation } = rotateToClearWrappingMotifs(sequenceRaw, [
    leftChimera,
    rightChimera,
  ])
  const mapIndex = (index: number) => {
    const n = ((index % sequenceRaw.length) + sequenceRaw.length) % sequenceRaw.length
    return (n - rotation + sequenceRaw.length) % sequenceRaw.length
  }

  const leftLoc = findProductSiteLocation(sequence, leftChimera, pUpstream.subtype)
  const rightLoc = findProductSiteLocation(sequence, rightChimera, pDownstream.subtype)

  const insertStart = mapIndex(backboneLen)
  const insertLen = payloadLen
  const insertLocations =
    insertStart + insertLen <= sequence.length
      ? [{ start: insertStart, end: insertStart + insertLen }]
      : [
          { start: insertStart, end: sequence.length },
          { start: 0, end: insertLen - (sequence.length - insertStart) },
        ]

  const partSpans: GatewayPartSpan[] = []
  for (const span of insertLocations) {
    if (span.end <= span.start) continue
    partSpans.push({
      start: span.start,
      end: span.end,
      color: gatewayInsertColor(),
      label: 'Insert',
      role: 'insert',
    })
  }
  // Donor = complement of insert on the circle.
  if (insertLocations.length === 1) {
    const span = insertLocations[0]!
    if (span.start > 0) {
      partSpans.push({
        start: 0,
        end: span.start,
        color: gatewayDonorColor(),
        label: 'Donor',
        role: 'donor',
      })
    }
    if (span.end < sequence.length) {
      partSpans.push({
        start: span.end,
        end: sequence.length,
        color: gatewayDonorColor(),
        label: 'Donor',
        role: 'donor',
      })
    }
  } else if (insertLocations.length === 2) {
    const [first, second] = insertLocations
    if (second && first && second.end < first.start) {
      partSpans.push({
        start: second.end,
        end: first.start,
        color: gatewayDonorColor(),
        label: 'Donor',
        role: 'donor',
      })
    }
  } else {
    partSpans.push({
      start: 0,
      end: sequence.length,
      color: gatewayDonorColor(),
      label: 'Donor',
      role: 'donor',
    })
  }
  if (leftLoc) {
    partSpans.push({
      start: leftLoc.start,
      end: leftLoc.end,
      color: '#31849b',
      label: leftSite,
      role: attSiteRole(leftSite),
    })
  }
  if (rightLoc) {
    partSpans.push({
      start: rightLoc.start,
      end: rightLoc.end,
      color: '#31849b',
      label: rightSite,
      role: attSiteRole(rightSite),
    })
  }

  const features: SequenceFeature[] = []
  if (leftLoc) {
    features.push({
      id: createId('feature'),
      name: leftSite,
      type: 'protein_bind',
      color: '#31849b',
      notes: notesForBpProductSite(leftSite),
      locations: [
        {
          start: leftLoc.start,
          end: leftLoc.end,
          strand: leftLoc.strand,
        },
      ],
    })
  }
  if (rightLoc) {
    features.push({
      id: createId('feature'),
      name: rightSite,
      type: 'protein_bind',
      color: '#31849b',
      notes: notesForBpProductSite(rightSite),
      locations: [
        {
          start: rightLoc.start,
          end: rightLoc.end,
          strand: rightLoc.strand,
        },
      ],
    })
  }
  features.push(
    // Inherit insert annotations for the gene only — exclude attB remnants that
    // form part of product attL/attR so CDS/misc features do not overlap those sites.
    ...offsetFeaturesInRange(
      insert.features,
      bUpstream.end,
      bDownstream.start,
      backboneLen - bUpCut,
    ).flatMap((feature) => remapFeatureThroughRotation(feature, mapIndex, sequence.length)),
    ...mapDonorBackboneFeatures(donor, pUpCut, pDownCut, backboneLen).flatMap((feature) =>
      remapFeatureThroughRotation(feature, mapIndex, sequence.length),
    ),
  )

  // Restore the donor plasmid's numbered origin (index 0), matching Gibson / SnapGene.
  // Annotation rotation above may have moved it; put it back at product coordinate 0.
  const donorOriginInRaw = donorOriginOffsetInBackbone(
    donor.sequence.length,
    pUpCut,
    pDownCut,
  )
  let finalSequence = sequence
  let finalFeatures = features
  let finalPartSpans = partSpans
  if (donorOriginInRaw != null && sequence.length > 0) {
    const originInProduct =
      (((donorOriginInRaw - rotation) % sequence.length) + sequence.length) % sequence.length
    if (originInProduct !== 0) {
      finalSequence = rotateCircularSequence(sequence, originInProduct)
      finalFeatures = features.map((feature) => ({
        ...feature,
        locations: feature.locations.flatMap((location) =>
          shiftLocationForOriginRestore(location, originInProduct, sequence.length),
        ),
      }))
      finalPartSpans = partSpans.flatMap((span) => {
        const shifted = shiftLocationForOriginRestore(
          { start: span.start, end: span.end, strand: 'forward' as const },
          originInProduct,
          sequence.length,
        )
        return shifted.map((location) => ({
          ...span,
          start: location.start,
          end: location.end,
        }))
      })
    }
  }

  return {
    ready: true,
    message: `Ready to clone. Product: ${finalSequence.length.toLocaleString()} bp.`,
    method: 'bp',
    productLength: finalSequence.length,
    warning: null,
    sequence: finalSequence,
    features: finalFeatures,
    partSpans: finalPartSpans,
    leftSite,
    rightSite,
  }
}

/**
 * Where donor coordinate 0 lands inside `backbone + payload` before annotation rotation.
 * Returns null when the origin was discarded with the ccdB cassette.
 */
function donorOriginOffsetInBackbone(
  donorLength: number,
  pUpCut: number,
  pDownCut: number,
): number | null {
  if (donorLength <= 0) return null
  if (pUpCut < pDownCut) {
    // backbone = donor.slice(pDownCut) + donor.slice(0, pUpCut)
    return donorLength - pDownCut
  }
  // backbone = donor.slice(pDownCut, pUpCut) — does not include index 0
  return null
}

function shiftLocationForOriginRestore<T extends { start: number; end: number; strand?: 'forward' | 'reverse' }>(
  location: T,
  origin: number,
  length: number,
): T[] {
  if (length === 0 || origin === 0) return [location]
  const start = ((location.start - origin) % length + length) % length
  const end = ((location.end - origin) % length + length) % length
  if (end > start) {
    return [{ ...location, start, end }]
  }
  if (end < start) {
    // Span wrapped through the new origin — split like GenBank wrap features.
    const pieces: T[] = []
    if (start < length) pieces.push({ ...location, start, end: length })
    if (end > 0) pieces.push({ ...location, start: 0, end })
    return pieces
  }
  return []
}

/** Locate a motif (or its reverse complement) on a circular sequence, including wrap-around. */
function findMotifLocationCircular(
  sequence: string,
  motif: string,
): { start: number; end: number; strand: 'forward' | 'reverse' } | null {
  const needle = normalizeDna(motif)
  if (!needle || !sequence || needle.length > sequence.length) return null
  const doubled = sequence + sequence
  const forward = doubled.indexOf(needle)
  if (forward >= 0 && forward < sequence.length) {
    const end = forward + needle.length
    if (end <= sequence.length) {
      return { start: forward, end, strand: 'forward' }
    }
    // Wraps: not representable as a single half-open span — treat as missing here.
    // Callers should rotate first via rotateToClearWrappingMotifs.
    return null
  }
  const rc = reverseComplement(needle)
  const reverse = doubled.indexOf(rc)
  if (reverse >= 0 && reverse < sequence.length) {
    const end = reverse + rc.length
    if (end <= sequence.length) {
      return { start: reverse, end, strand: 'reverse' }
    }
    return null
  }
  return null
}

/**
 * Locate an attL/attR product site. Prefer SnapGene's common leading-C extension
 * on attL features (CAAATAATG… / trailing G on the reverse-strand top annotation).
 */
function findProductSiteLocation(
  sequence: string,
  chimera: string,
  pSubtype: string,
): { start: number; end: number; strand: 'forward' | 'reverse' } | null {
  if (!/r$/i.test(pSubtype)) {
    const extended = findMotifLocationCircular(sequence, `C${chimera}`)
    if (extended) return extended
  }
  return findMotifLocationCircular(sequence, chimera)
}

function rotateCircularDna(sequence: string, offset: number) {
  if (!sequence) return sequence
  const n = ((offset % sequence.length) + sequence.length) % sequence.length
  if (n === 0) return sequence
  return sequence.slice(n) + sequence.slice(0, n)
}

/**
 * Rotate a circular product so that each motif (or its RC) lies in one contiguous linear span.
 * `offset` is the total left-rotation applied to the original sequence.
 */
function rotateToClearWrappingMotifs(
  sequence: string,
  motifs: string[],
): { sequence: string; offset: number } {
  let current = sequence
  let offset = 0
  for (let pass = 0; pass < motifs.length + 1; pass += 1) {
    let rotated = false
    for (const motif of motifs) {
      const needle = normalizeDna(motif)
      if (!needle) continue
      for (const candidate of [needle, reverseComplement(needle)]) {
        const doubled = current + current
        const idx = doubled.indexOf(candidate)
        if (idx < 0 || idx >= current.length) continue
        if (idx + candidate.length <= current.length) continue
        current = rotateCircularDna(current, idx)
        offset = (offset + idx) % sequence.length
        rotated = true
        break
      }
      if (rotated) break
    }
    if (!rotated) break
  }
  return { sequence: current, offset }
}

function remapFeatureThroughRotation(
  feature: SequenceFeature,
  mapIndex: (index: number) => number,
  productLength: number,
): SequenceFeature[] {
  const locations: SequenceFeature['locations'] = []
  for (const location of feature.locations) {
    const start = mapIndex(location.start)
    const end = mapIndex(location.end)
    if (end > start) {
      locations.push({ ...location, start, end })
    } else if (end < start) {
      // Span wrapped through the origin after rotation — split.
      if (start < productLength) {
        locations.push({ ...location, start, end: productLength })
      }
      if (end > 0) {
        locations.push({ ...location, start: 0, end })
      }
    }
  }
  if (!locations.length) return []
  return [{ ...feature, id: createId('feature'), locations }]
}

function offsetFeaturesInRange(
  features: SequenceFeature[],
  rangeStart: number,
  rangeEnd: number,
  delta: number,
): SequenceFeature[] {
  return features
    .map((feature) => ({
      ...feature,
      id: createId('feature'),
      locations: feature.locations
        .map((location) => {
          const start = Math.max(location.start, rangeStart)
          const end = Math.min(location.end, rangeEnd)
          if (end <= start) return null
          return {
            ...location,
            start: start + delta,
            end: end + delta,
          }
        })
        .filter((location): location is NonNullable<typeof location> => Boolean(location)),
    }))
    .filter((feature) => feature.locations.length > 0)
}

function mapDonorBackboneFeatures(
  donor: Pick<ResolvedGatewayDonor, 'sequence' | 'features'>,
  pUpCut: number,
  pDownCut: number,
  backboneLen: number,
): SequenceFeature[] {
  const seqLen = donor.sequence.length
  const results: SequenceFeature[] = []
  for (const feature of donor.features) {
    if (/^att[PR]/i.test(feature.name) || /^ccdB$/i.test(feature.name)) continue
    for (const location of feature.locations) {
      // Keep locations that lie entirely on the kept backbone arc from pDownCut → … → pUpCut.
      const points: Array<{ start: number; end: number }> = []
      if (pUpCut < pDownCut) {
        // Backbone = [pDownCut, len) + [0, pUpCut)
        if (location.end > pDownCut) {
          points.push({
            start: Math.max(location.start, pDownCut),
            end: Math.min(location.end, seqLen),
          })
        }
        if (location.start < pUpCut) {
          points.push({
            start: Math.max(location.start, 0),
            end: Math.min(location.end, pUpCut),
          })
        }
      } else {
        // Backbone = [pDownCut, pUpCut)
        if (location.end > pDownCut && location.start < pUpCut) {
          points.push({
            start: Math.max(location.start, pDownCut),
            end: Math.min(location.end, pUpCut),
          })
        }
      }
      for (const piece of points) {
        if (piece.end <= piece.start) continue
        const mappedStart =
          pUpCut < pDownCut
            ? piece.start >= pDownCut
              ? piece.start - pDownCut
              : piece.start + (seqLen - pDownCut)
            : piece.start - pDownCut
        const mappedEnd =
          pUpCut < pDownCut
            ? piece.start >= pDownCut
              ? piece.end - pDownCut
              : piece.end + (seqLen - pDownCut)
            : piece.end - pDownCut
        if (mappedEnd <= mappedStart || mappedStart >= backboneLen) continue
        results.push({
          ...feature,
          id: createId('feature'),
          locations: [
            {
              ...location,
              start: Math.max(0, mappedStart),
              end: Math.min(backboneLen, mappedEnd),
            },
          ],
        })
      }
    }
  }
  return results
}

export function analyzeGatewayAssembly(
  insert: ResolvedGatewayInsert,
  donor: ResolvedGatewayDonor,
  method: GatewayCloningMethod,
): GatewayAnalysis {
  if (method === 'lr') {
    return emptyAnalysis('lr', 'Use analyzeGatewayLrAssembly for LR Cloning.')
  }
  return analyzeGatewayBpAssembly(insert, donor)
}

function emptyEntry(message: string, source?: SequenceRecord | null): ResolvedGatewayEntry {
  return {
    role: 'entry',
    name: 'Entry Clone',
    label: 'Entry Clone',
    color: gatewayEntryColor(0),
    sequence: '',
    features: [],
    primers: [],
    source: source || {
      id: 'empty-entry',
      name: 'Entry Clone',
      description: '',
      molecule: 'dna',
      topology: 'circular',
      sequence: '',
      features: [],
      primers: [],
      operations: [],
      dnaEnds: defaultDnaEnds(),
      construct: defaultConstructProperties,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    ready: false,
    message,
    attSites: [],
    left: null,
    right: null,
  }
}

function emptyDestination(message: string, source?: SequenceRecord | null): ResolvedGatewayDestination {
  return {
    role: 'destination',
    name: 'Destination Vector',
    label: 'Destination Vector',
    color: gatewayDestinationColor(),
    sequence: '',
    features: [],
    primers: [],
    source: source || {
      id: 'empty-destination',
      name: 'Destination Vector',
      description: '',
      molecule: 'dna',
      topology: 'circular',
      sequence: '',
      features: [],
      primers: [],
      operations: [],
      dnaEnds: defaultDnaEnds(),
      construct: defaultConstructProperties,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    ready: false,
    message,
    attSites: [],
    left: null,
    right: null,
  }
}

function attBaseNumber(subtype: string) {
  return subtype.replace(/r$/i, '') || subtype
}

/** attL_n × attR_n (r suffix ignored). */
export function gatewayLrSitesCompatible(a: AttSiteHit, b: AttSiteHit): boolean {
  if (attBaseNumber(a.subtype) !== attBaseNumber(b.subtype)) return false
  return (a.kind === 'L' && b.kind === 'R') || (a.kind === 'R' && b.kind === 'L')
}

/** Flanking attL/attR pair on an entry clone (leftmost → rightmost by coord). */
export function pickEntryAttPair(sites: AttSiteHit[]): { left: AttSiteHit; right: AttSiteHit } | null {
  const lr = sites.filter((site) => site.kind === 'L' || site.kind === 'R')
  if (lr.length < 2) return null
  const sorted = [...lr].sort((a, b) => a.start - b.start || a.end - b.end)
  const left = sorted[0]!
  const right = sorted[sorted.length - 1]!
  if (left.start === right.start && left.end === right.end) return null
  return { left, right }
}

/** Destination attR pair — prefer R1/R2, then R4/R3, else leftmost two attR. */
export function pickDestinationAttRPair(sites: AttSiteHit[]): { left: AttSiteHit; right: AttSiteHit } | null {
  const attR = sites.filter((site) => site.kind === 'R')
  if (attR.length < 2) return null
  const prefer: Array<[string, string]> = [
    ['1', '2'],
    ['4', '3'],
    ['3', '2'],
    ['1', '4'],
  ]
  for (const [a, b] of prefer) {
    const left = attR.find((site) => attBaseNumber(site.subtype) === a)
    const right = attR.find((site) => attBaseNumber(site.subtype) === b)
    if (left && right && left !== right) {
      return left.start <= right.start ? { left, right } : { left: right, right: left }
    }
  }
  const sorted = [...attR].sort((a, b) => a.start - b.start)
  return { left: sorted[0]!, right: sorted[1]! }
}

export function resolveGatewayEntry(
  config: GatewayEntryConfig,
  index = 0,
): ResolvedGatewayEntry {
  if (!config.record) return emptyEntry('Choose an Entry Clone.')
  const sequence = normalizeDna(config.record.sequence)
  if (!sequence) return emptyEntry('Choose an Entry Clone.', config.record)
  if (config.record.topology !== 'circular') {
    return {
      ...emptyEntry('Entry Clone must be circular.', config.record),
      sequence,
      features: config.record.features,
      primers: config.record.primers,
      source: config.record,
      name: config.record.name,
    }
  }
  const attSites = findAttSites(config.record, ['L', 'R'])
  const pair = pickEntryAttPair(attSites)
  const color = gatewayEntryColor(index)
  if (!pair) {
    return {
      role: 'entry',
      name: config.record.name,
      label: `Entry ${index + 1}`,
      color,
      sequence,
      features: config.record.features,
      primers: config.record.primers,
      source: config.record,
      ready: false,
      message: 'Entry Clone needs a pair of attL/attR recombination sites.',
      attSites,
      left: null,
      right: null,
    }
  }
  return {
    role: 'entry',
    name: config.record.name,
    label: `Entry ${index + 1}`,
    color,
    sequence,
    features: config.record.features,
    primers: config.record.primers,
    source: config.record,
    ready: true,
    message: `${config.record.name}: ${pair.left.name} … ${pair.right.name}`,
    attSites,
    left: pair.left,
    right: pair.right,
  }
}

export function resolveGatewayDestination(
  config: GatewayVectorConfig,
  standardRecord: SequenceRecord | null,
): ResolvedGatewayDestination {
  const source =
    config.source === 'custom'
      ? config.customRecord
      : standardRecord
  if (!source) {
    return emptyDestination(
      config.source === 'standard'
        ? 'Choose a Destination Vector.'
        : 'Choose a custom Destination Vector.',
    )
  }
  const sequence = normalizeDna(source.sequence)
  if (!sequence) return emptyDestination('Destination Vector has no sequence.', source)
  if (source.topology !== 'circular') {
    return {
      ...emptyDestination('Destination Vector must be circular.', source),
      sequence,
      features: source.features,
      primers: source.primers,
      source,
      name: source.name,
    }
  }
  const attSites = findAttSites({ ...source, sequence }, ['R'])
  const pair = pickDestinationAttRPair(attSites)
  if (!pair) {
    return {
      role: 'destination',
      name: source.name,
      label: 'Destination Vector',
      color: gatewayDestinationColor(),
      sequence,
      features: source.features,
      primers: source.primers,
      source,
      ready: false,
      message: 'Destination Vector needs a pair of attR recombination sites.',
      attSites,
      left: null,
      right: null,
    }
  }
  return {
    role: 'destination',
    name: source.name,
    label: 'Destination Vector',
    color: gatewayDestinationColor(),
    sequence,
    features: source.features,
    primers: source.primers,
    source,
    ready: true,
    message: `${source.name}: ${pair.left.name} … ${pair.right.name}`,
    attSites,
    left: pair.left,
    right: pair.right,
  }
}

function lrProductAttBLabel(subtype: string) {
  return `attB${attBaseNumber(subtype)}`
}

/**
 * LR reaction: Entry Clone attL/attR × Destination attR → Expression Clone.
 * Supports classic (1 entry) and Multisite (2–4 ordered entries).
 */
export function analyzeGatewayLrAssembly(
  entries: ResolvedGatewayEntry[],
  destination: ResolvedGatewayDestination,
): GatewayAnalysis {
  if (!destination.ready || !destination.left || !destination.right) {
    return emptyAnalysis('lr', destination.message)
  }
  if (entries.length < 1) {
    return emptyAnalysis('lr', 'Add at least one Entry Clone.')
  }
  if (entries.length > MAX_GATEWAY_LR_ENTRIES) {
    return emptyAnalysis('lr', `At most ${MAX_GATEWAY_LR_ENTRIES} Entry Clones are supported.`)
  }
  for (const entry of entries) {
    if (!entry.ready || !entry.left || !entry.right) {
      return emptyAnalysis('lr', entry.message)
    }
  }

  const destLeft = destination.left
  const destRight = destination.right
  if (!gatewayLrSitesCompatible(entries[0]!.left!, destLeft)) {
    return emptyAnalysis(
      'lr',
      `Entry 1 left site ${entries[0]!.left!.name} is incompatible with Destination ${destLeft.name}.`,
    )
  }
  if (!gatewayLrSitesCompatible(entries[entries.length - 1]!.right!, destRight)) {
    return emptyAnalysis(
      'lr',
      `Entry ${entries.length} right site ${entries[entries.length - 1]!.right!.name} is incompatible with Destination ${destRight.name}.`,
    )
  }
  for (let i = 0; i < entries.length - 1; i++) {
    const right = entries[i]!.right!
    const nextLeft = entries[i + 1]!.left!
    if (!gatewayLrSitesCompatible(right, nextLeft)) {
      return emptyAnalysis(
        'lr',
        `Entry ${i + 1} ${right.name} is incompatible with Entry ${i + 2} ${nextLeft.name}.`,
      )
    }
  }

  type Junction = {
    entrySite: AttSiteHit
    destOrNeighborSite: AttSiteHit
    entrySequence: string
    neighborSequence: string
    xo: { bOffset: number; pOffset: number; sharedLength: number }
  }

  const leftJunctions: Junction[] = []
  const rightJunctions: Junction[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const leftPartner = i === 0 ? destLeft : entries[i - 1]!.right!
    const rightPartner = i === entries.length - 1 ? destRight : entries[i + 1]!.left!
    const leftPartnerSeq = i === 0 ? destination.sequence : entries[i - 1]!.sequence
    const rightPartnerSeq = i === entries.length - 1 ? destination.sequence : entries[i + 1]!.sequence

    const leftEntryMotif = functionalTopMotif(entry.left!, entry.sequence)
    const leftPartnerMotif = functionalTopMotif(leftPartner, leftPartnerSeq)
    const rightEntryMotif = functionalTopMotif(entry.right!, entry.sequence)
    const rightPartnerMotif = functionalTopMotif(rightPartner, rightPartnerSeq)

    // Treat L motif as "B-like" and R as "P-like" for shared-core alignment.
    const lIsLeft = entry.left!.kind === 'L'
    const xoLeft = lIsLeft
      ? crossoverOffsets(leftEntryMotif, leftPartnerMotif, leftPartner.subtype)
      : crossoverOffsets(leftPartnerMotif, leftEntryMotif, entry.left!.subtype)
    const rIsRight = entry.right!.kind === 'L'
    const xoRight = rIsRight
      ? crossoverOffsets(rightEntryMotif, rightPartnerMotif, rightPartner.subtype)
      : crossoverOffsets(rightPartnerMotif, rightEntryMotif, entry.right!.subtype)

    if (!xoLeft || !xoRight) {
      return emptyAnalysis('lr', `Could not align recombination cores for Entry ${i + 1}.`)
    }

    leftJunctions.push({
      entrySite: entry.left!,
      destOrNeighborSite: leftPartner,
      entrySequence: entry.sequence,
      neighborSequence: leftPartnerSeq,
      xo: xoLeft,
    })
    rightJunctions.push({
      entrySite: entry.right!,
      destOrNeighborSite: rightPartner,
      entrySequence: entry.sequence,
      neighborSequence: rightPartnerSeq,
      xo: xoRight,
    })
  }

  // Cuts on destination for outer sites.
  const destLeftIsR = destLeft.kind === 'R'
  const destRightIsR = destRight.kind === 'R'
  const firstLeft = leftJunctions[0]!
  const lastRight = rightJunctions[rightJunctions.length - 1]!
  const pUpCut = destLeftIsR
    ? absoluteCrossoverOnTop(destLeft, firstLeft.xo.pOffset)
    : absoluteCrossoverOnTop(destLeft, firstLeft.xo.bOffset)
  const pDownCut = destRightIsR
    ? absoluteCrossoverOnTop(destRight, lastRight.xo.pOffset)
    : absoluteCrossoverOnTop(destRight, lastRight.xo.bOffset)

  let backbone: string
  if (pUpCut < pDownCut) {
    backbone = destination.sequence.slice(pDownCut) + destination.sequence.slice(0, pUpCut)
  } else {
    backbone = destination.sequence.slice(pDownCut, pUpCut)
  }

  const payloads: string[] = []
  const entryPayloadMeta: Array<{ startInRaw: number; length: number; entryIndex: number }> = []
  let payloadCursor = backbone.length

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const leftJ = leftJunctions[i]!
    const rightJ = rightJunctions[i]!
    const leftCut =
      entry.left!.kind === 'L'
        ? absoluteCrossoverOnTop(entry.left!, leftJ.xo.bOffset)
        : absoluteCrossoverOnTop(entry.left!, leftJ.xo.pOffset)
    const rightCut =
      entry.right!.kind === 'L'
        ? absoluteCrossoverOnTop(entry.right!, rightJ.xo.bOffset)
        : absoluteCrossoverOnTop(entry.right!, rightJ.xo.pOffset)
    if (rightCut <= leftCut) {
      return emptyAnalysis('lr', `Entry ${i + 1} att sites are in an unexpected order.`)
    }
    const payload = entry.sequence.slice(leftCut, rightCut)
    entryPayloadMeta.push({ startInRaw: payloadCursor, length: payload.length, entryIndex: i })
    payloadCursor += payload.length
    payloads.push(payload)
  }

  const sequenceRaw = sanitizeDna(backbone + payloads.join(''))
  const backboneLen = backbone.length

  // Product site labels (outer attB only for display; Multisite has internal attB too).
  const leftSite = lrProductAttBLabel(destLeft.subtype)
  const rightSite = lrProductAttBLabel(destRight.subtype)

  // For annotation, locate short attB cores from the canonical motifs around each junction.
  const attBNeedles: string[] = []
  const junctionBases = [
    attBaseNumber(destLeft.subtype),
    ...entries.slice(0, -1).map((entry) => attBaseNumber(entry.right!.subtype)),
    attBaseNumber(destRight.subtype),
  ]
  /** SnapGene Common Features cores for LR product attB annotation (shorter than full oligos). */
  const ATTB_PRODUCT_CORES: Record<string, string[]> = {
    '1': ['ACAAGTTTGTACAAAAAAGCAGGCT', 'AAGTTTGTACAAAAAAGCAGGCT', 'CAAGTTTGTACAAAAAAGCAG'],
    '2': ['ACCACTTTGTACAAGAAAGCTGGGT', 'CACTTTGTACAAGAAAGCTGGGT', 'CCACTTTGTACAAGAAAGCTG'],
    '3': ['CAACTTTGTATAATAAAGTTG', 'CCAACTTTGTATAATAAAGTTG'],
    '4': ['CAACTTTGTATAGAAAAGTTG', 'CCAACTTTGTATAGAAAAGTTG'],
    '5': ['CAACTTTGTATACAAAAGTTG'],
  }
  for (const base of new Set(junctionBases)) {
    for (const motif of ATTB_PRODUCT_CORES[base] || []) attBNeedles.push(motif)
  }

  const { sequence, offset: rotation } = rotateToClearWrappingMotifs(sequenceRaw, attBNeedles)
  const mapIndex = (index: number) => {
    const n = ((index % sequenceRaw.length) + sequenceRaw.length) % sequenceRaw.length
    return (n - rotation + sequenceRaw.length) % sequenceRaw.length
  }

  const partSpans: GatewayPartSpan[] = []

  /** Map a half-open raw interval through annotation rotation, splitting at the origin if needed. */
  const mappedRanges = (rawStart: number, rawEnd: number): Array<{ start: number; end: number }> => {
    if (rawEnd <= rawStart || sequence.length === 0) return []
    const start = mapIndex(rawStart)
    const end = mapIndex(rawEnd)
    if (end > start) return [{ start, end }]
    if (end < start) {
      const pieces: Array<{ start: number; end: number }> = []
      if (start < sequence.length) pieces.push({ start, end: sequence.length })
      if (end > 0) pieces.push({ start: 0, end })
      return pieces
    }
    return []
  }

  for (const meta of entryPayloadMeta) {
    for (const range of mappedRanges(meta.startInRaw, meta.startInRaw + meta.length)) {
      partSpans.push({
        ...range,
        color: gatewayEntryColor(meta.entryIndex),
        label: `Entry ${meta.entryIndex + 1}`,
        role: 'insert',
      })
    }
  }
  // Destination backbone occupies [0, backboneLen) in pre-rotation coordinates.
  for (const range of mappedRanges(0, backboneLen)) {
    partSpans.push({
      ...range,
      color: gatewayDestinationColor(),
      label: 'Destination',
      role: 'donor',
    })
  }

  const features: SequenceFeature[] = []
  for (const base of junctionBases) {
    const cores = ATTB_PRODUCT_CORES[base] || []
    let annotated = false
    for (const motif of cores) {
      const loc = findMotifLocationCircular(sequence, motif)
      if (!loc) continue
      const name = `attB${base}`
      if (features.some((feature) => feature.name === name)) {
        annotated = true
        break
      }
      features.push({
        id: createId('feature'),
        name,
        type: 'protein_bind',
        color: '#31849b',
        notes: serializeFeatureQualifiers({
          bound_moiety: 'BP Clonase™',
          gene: 'mutant version of attB',
          note: 'recombination site for the Gateway® BP reaction',
        }),
        locations: [{ start: loc.start, end: loc.end, strand: loc.strand }],
      })
      partSpans.push({
        start: loc.start,
        end: loc.end,
        color: '#31849b',
        label: name,
        role: 'attL',
      })
      annotated = true
      break
    }
    void annotated
  }

  // Inherit entry gene features (between original att spans) and destination backbone.
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const meta = entryPayloadMeta[i]!
    const leftCutApprox = entry.left!.end
    const rightCutApprox = entry.right!.start
    const geneStart = Math.min(leftCutApprox, rightCutApprox)
    const geneEnd = Math.max(leftCutApprox, rightCutApprox)
    features.push(
      ...offsetFeaturesInRange(entry.features, geneStart, geneEnd, meta.startInRaw - geneStart).flatMap(
        (feature) => remapFeatureThroughRotation(feature, mapIndex, sequence.length),
      ),
    )
  }
  features.push(
    ...mapDonorBackboneFeatures(destination, pUpCut, pDownCut, backboneLen).flatMap((feature) =>
      remapFeatureThroughRotation(feature, mapIndex, sequence.length),
    ),
  )

  const donorOriginInRaw = donorOriginOffsetInBackbone(destination.sequence.length, pUpCut, pDownCut)
  let finalSequence = sequence
  let finalFeatures = features
  let finalPartSpans = partSpans
  if (donorOriginInRaw != null && sequence.length > 0) {
    const originInProduct =
      (((donorOriginInRaw - rotation) % sequence.length) + sequence.length) % sequence.length
    if (originInProduct !== 0) {
      finalSequence = rotateCircularSequence(sequence, originInProduct)
      finalFeatures = features.map((feature) => ({
        ...feature,
        locations: feature.locations.flatMap((location) =>
          shiftLocationForOriginRestore(location, originInProduct, sequence.length),
        ),
      }))
      finalPartSpans = partSpans.flatMap((span) => {
        const shifted = shiftLocationForOriginRestore(
          { start: span.start, end: span.end, strand: 'forward' as const },
          originInProduct,
          sequence.length,
        )
        return shifted.map((location) => ({
          ...span,
          start: location.start,
          end: location.end,
        }))
      })
    }
  }

  return {
    ready: true,
    message: `Ready to clone. Product: ${finalSequence.length.toLocaleString()} bp.`,
    method: 'lr',
    productLength: finalSequence.length,
    warning: null,
    sequence: finalSequence,
    features: finalFeatures,
    partSpans: finalPartSpans,
    leftSite,
    rightSite,
  }
}

function shiftPrimerBinding(
  binding: NonNullable<Primer['bindings']>[number],
  delta: number,
  productLength: number,
) {
  const templateStart = binding.templateStart + delta
  const templateEnd = binding.templateEnd + delta
  if (templateEnd <= 0 || templateStart >= productLength) return null
  return {
    ...binding,
    templateStart: Math.max(0, templateStart),
    templateEnd: Math.min(productLength, templateEnd),
    components: (binding.components || []).map((component) => ({
      ...component,
      templateStart:
        component.templateStart === undefined
          ? undefined
          : Math.max(0, Math.min(productLength, component.templateStart + delta)),
      templateEnd:
        component.templateEnd === undefined
          ? undefined
          : Math.max(0, Math.min(productLength, component.templateEnd + delta)),
    })),
  }
}

/**
 * Carry insert PCR primers onto the BP entry clone.
 *
 * Full attB overhangs no longer exact-match after attB→attL recombination, so we remap
 * bindings from the linear attB insert onto the product insert/payload span, then refresh
 * soft hybridization as a fallback.
 */
function mapGatewayInsertPrimersOntoProduct(
  insert: ResolvedGatewayInsert,
  analysis: GatewayAnalysis,
): Primer[] {
  if (!insert.primers.length || !analysis.sequence) return []

  const payloadSpan = analysis.partSpans.find((span) => span.role === 'insert')
  const payload =
    payloadSpan != null
      ? analysis.sequence.slice(payloadSpan.start, payloadSpan.end)
      : ''
  const payloadStartOnInsert = payload ? insert.sequence.indexOf(payload) : -1
  const canRemap = payloadSpan != null && payloadStartOnInsert >= 0
  const delta = canRemap ? payloadSpan!.start - payloadStartOnInsert : 0
  const productLength = analysis.sequence.length

  const remapped = insert.primers.map((primer) => {
    if (canRemap && primer.bindings?.length) {
      const bindings = primer.bindings
        .map((binding) => shiftPrimerBinding(binding, delta, productLength))
        .filter((binding): binding is NonNullable<typeof binding> => Boolean(binding))
        .filter((binding) => binding.templateEnd > binding.templateStart)
      if (bindings.length) {
        return { ...primer, id: createId('primer'), bindings }
      }
    }
    return { ...primer, id: createId('primer'), bindings: undefined }
  })

  return refreshExactPrimerBindings(remapped, analysis.sequence)
}

export function assembleGatewayProduct(input: {
  insert: ResolvedGatewayInsert
  donor: ResolvedGatewayDonor
  analysis: GatewayAnalysis
  productName: string
  constructOverrides?: Partial<ConstructProperties>
  includePartSpans?: boolean
}): SequenceRecord {
  const { insert, donor, analysis, productName } = input
  if (!analysis.ready || !analysis.sequence) {
    throw new Error(analysis.message || 'Gateway cloning is not ready.')
  }

  const name = productName.replace(/\.dna$/i, '') || 'Entry Clone'
  const sequence = analysis.sequence
  const features: SequenceFeature[] = [...analysis.features]
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
  const primers = mapGatewayInsertPrimersOntoProduct(insert, analysis)
  if (donor.primers.length) {
    primers.push(...refreshExactPrimerBindings(donor.primers, sequence))
  }

  let record: SequenceRecord = {
    id: createId('seq'),
    name,
    description: `${gatewayMethodLabel(analysis.method)} product`,
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features,
    primers,
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: normalizeConstructProperties({
      ...donor.source.construct,
      syntheticDna: true,
      hostMethylation: methylationForStrain(
        input.constructOverrides?.bacterialTransformationStrain ??
          donor.source.construct.bacterialTransformationStrain,
      ),
      ...input.constructOverrides,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const history = {
    id: createId('history'),
    name: name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`,
    seqLen: sequence.length,
    circular: true as const,
    operation: analysis.method === 'lr' ? 'gatewayLr' : 'gatewayBp',
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
        name: donor.source.name.toLowerCase().endsWith('.dna')
          ? donor.source.name
          : `${donor.source.name}.dna`,
        seqLen: donor.source.sequence.length,
        circular: donor.source.topology === 'circular',
        operation: 'invalid',
        resurrectable: true,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        sequence: donor.source.sequence,
        primers: donor.source.primers,
        traceFiles: donor.source.traceFiles,
        children: [],
      },
    ],
  }

  record = { ...record, history }
  return addOperation(
    record,
    analysis.method === 'lr' ? 'gateway-lr' : 'gateway-bp',
    `${gatewayMethodLabel(analysis.method)}: ${insert.label} + ${donor.name}`,
  )
}

export function gatewayPreviewRecord(
  analysis: GatewayAnalysis,
  insert: ResolvedGatewayInsert,
  donor: ResolvedGatewayDonor,
): SequenceRecord | null {
  if (!analysis.ready || !analysis.sequence) return null
  try {
    return {
      ...assembleGatewayProduct({
        insert,
        donor,
        analysis,
        productName: 'Entry Clone',
        includePartSpans: true,
      }),
      id: 'gateway-preview',
      description: `${gatewayMethodLabel(analysis.method)} preview`,
    }
  } catch {
    return null
  }
}

export function assembleGatewayLrProduct(input: {
  entries: ResolvedGatewayEntry[]
  destination: ResolvedGatewayDestination
  analysis: GatewayAnalysis
  productName: string
  constructOverrides?: Partial<ConstructProperties>
  includePartSpans?: boolean
}): SequenceRecord {
  const { entries, destination, analysis, productName } = input
  if (!analysis.ready || !analysis.sequence || analysis.method !== 'lr') {
    throw new Error(analysis.message || 'Gateway LR cloning is not ready.')
  }

  const name = productName.replace(/\.dna$/i, '') || 'Expression Clone'
  const sequence = analysis.sequence
  const features: SequenceFeature[] = [...analysis.features]
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

  const primers: Primer[] = []
  for (const entry of entries) {
    primers.push(...refreshExactPrimerBindings(entry.primers, sequence))
  }
  primers.push(...refreshExactPrimerBindings(destination.primers, sequence))

  let record: SequenceRecord = {
    id: createId('seq'),
    name,
    description: `${gatewayMethodLabel('lr')} product`,
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features,
    primers,
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: normalizeConstructProperties({
      ...destination.source.construct,
      syntheticDna: true,
      hostMethylation: methylationForStrain(
        input.constructOverrides?.bacterialTransformationStrain ??
          destination.source.construct.bacterialTransformationStrain,
      ),
      ...input.constructOverrides,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const historyChildren = [
    ...entries.map((entry) => ({
      id: createId('history'),
      name: entry.source.name.toLowerCase().endsWith('.dna')
        ? entry.source.name
        : `${entry.source.name}.dna`,
      seqLen: entry.source.sequence.length,
      circular: entry.source.topology === 'circular',
      operation: 'invalid' as const,
      resurrectable: true,
      hideHistory: false,
      oligos: [],
      regeneratedSites: [],
      inputSummaries: [],
      features: [],
      sequence: entry.source.sequence,
      primers: entry.source.primers,
      traceFiles: entry.source.traceFiles,
      children: [],
    })),
    {
      id: createId('history'),
      name: destination.source.name.toLowerCase().endsWith('.dna')
        ? destination.source.name
        : `${destination.source.name}.dna`,
      seqLen: destination.source.sequence.length,
      circular: destination.source.topology === 'circular',
      operation: 'invalid' as const,
      resurrectable: true,
      hideHistory: false,
      oligos: [],
      regeneratedSites: [],
      inputSummaries: [],
      features: [],
      sequence: destination.source.sequence,
      primers: destination.source.primers,
      traceFiles: destination.source.traceFiles,
      children: [],
    },
  ]

  const history = {
    id: createId('history'),
    name: name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`,
    seqLen: sequence.length,
    circular: true as const,
    operation: 'gatewayLr' as const,
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence,
    primers: record.primers,
    children: historyChildren,
  }

  record = { ...record, history }
  const entryNames = entries.map((entry) => entry.name).join(' + ')
  return addOperation(
    record,
    'gateway-lr',
    `LR Cloning: ${entryNames} + ${destination.name}`,
  )
}

export function gatewayLrPreviewRecord(
  analysis: GatewayAnalysis,
  entries: ResolvedGatewayEntry[],
  destination: ResolvedGatewayDestination,
): SequenceRecord | null {
  if (!analysis.ready || !analysis.sequence) return null
  try {
    return {
      ...assembleGatewayLrProduct({
        entries,
        destination,
        analysis,
        productName: 'Expression Clone',
        includePartSpans: true,
      }),
      id: 'gateway-lr-preview',
      description: 'LR Cloning preview',
    }
  } catch {
    return null
  }
}

/** λ Int–style 7 bp strand-exchange stagger shown in SnapGene Gateway ends. */
export const GATEWAY_STRAND_EXCHANGE_BP = 7

const ATTB_PRODUCT_CORE_MOTIFS: Record<string, string[]> = {
  '1': ['ACAAGTTTGTACAAAAAAGCAGGCT', 'AAGTTTGTACAAAAAAGCAGGCT', 'CAAGTTTGTACAAAAAAGCAG'],
  '2': ['ACCACTTTGTACAAGAAAGCTGGGT', 'CACTTTGTACAAGAAAGCTGGGT', 'CCACTTTGTACAAGAAAGCTG'],
  '3': ['CAACTTTGTATAATAAAGTTG', 'CCAACTTTGTATAATAAAGTTG'],
  '4': ['CAACTTTGTATAGAAAAGTTG', 'CCAACTTTGTATAGAAAAGTTG'],
  '5': ['CAACTTTGTATACAAAAGTTG'],
}

export type GatewayLrEndsBaseRole = 'flank' | 'insert' | 'gap'

export type GatewayLrEndsDuplex = {
  ready: boolean
  message: string
  color: string
  /** Contrasting ink for nucleotides on the highlight (`#111` or `#fff`). */
  inkColor: string
  centerLabel: string
  leftLabel: string
  rightLabel: string
  /** Leading flank width (chars) — site labels sit inward of this padding. */
  leftFlankChars: number
  rightFlankChars: number
  top: Array<{ text: string; role: GatewayLrEndsBaseRole }>
  bottom: Array<{ text: string; role: GatewayLrEndsBaseRole }>
}

export type GatewayLrAssemblyJunction = {
  leftName: string
  rightName: string
  compatible: boolean
}

export type GatewayLrAssemblyFragment = {
  index: number
  color: string
  leftName: string
  rightName: string
  /** True when both sites that join this fragment participate in compatible pairs. */
  matched: boolean
  row: 0 | 1
}

export type GatewayLrAssemblyDiagram = {
  ready: boolean
  message: string
  destination: {
    color: string
    leftName: string
    rightName: string
  }
  fragments: GatewayLrAssemblyFragment[]
  /** Junctions in left→right order: dest×entry0, entry0×entry1, …, entryLast×dest. */
  junctions: GatewayLrAssemblyJunction[]
  productSiteLabels: string[]
  allMatched: boolean
}

function findAttCoreMotifOffset(motif: string, subtype: string): number | null {
  const normalized = normalizeDna(motif)
  const base = attBaseNumber(subtype)
  const candidates = [
    ...(ATTR_CORE_PREFIXES[base] || []),
    ...(ATTB_PRODUCT_CORE_MOTIFS[base] || []),
    ATTB_MOTIFS[base] || '',
    ATTB_MOTIFS[subtype] || '',
  ]
    .map((value) => normalizeDna(value))
    .filter((value) => value.length >= 12)

  let best: { index: number; length: number } | null = null
  for (const core of candidates) {
    const index = normalized.indexOf(core)
    if (index >= 0 && (!best || core.length > best.length)) {
      best = { index, length: core.length }
    }
  }
  if (best) return best.index

  for (const core of candidates) {
    const shared = longestCommonSubstring(normalized, core)
    if (!shared || shared.length < 12) continue
    if (!best || shared.length > best.length) {
      best = { index: shared.aIndex, length: shared.length }
    }
  }
  return best?.index ?? null
}

/**
 * Top-strand coordinates of the SnapGene staggered crossover for one att site.
 * Top cut is 7 bp into the conserved core; bottom cut is 7 bp further (strand exchange).
 */
export function gatewayAttSiteStrandCuts(
  site: AttSiteHit,
  sequence: string,
): { top: number; bottom: number } | null {
  const motif = functionalTopMotif(site, sequence)
  const coreOffset = findAttCoreMotifOffset(motif, site.subtype)
  if (coreOffset == null) return null
  if (coreOffset + 2 * GATEWAY_STRAND_EXCHANGE_BP > motif.length) return null
  const a = absoluteCrossoverOnTop(site, coreOffset + GATEWAY_STRAND_EXCHANGE_BP)
  const b = absoluteCrossoverOnTop(site, coreOffset + 2 * GATEWAY_STRAND_EXCHANGE_BP)
  return { top: Math.min(a, b), bottom: Math.max(a, b) }
}

function formatAttSiteArrowLabel(site: AttSiteHit, side: 'left' | 'right') {
  // Left boundary reads site→ ; right boundary reads ←site (SnapGene convention).
  return side === 'left' ? `${site.name} →` : `← ${site.name}`
}

function complementBase(base: string) {
  switch (base.toLowerCase()) {
    case 'a':
      return 't'
    case 't':
      return 'a'
    case 'g':
      return 'c'
    case 'c':
      return 'g'
    default:
      return 'n'
  }
}

function duplexComplement(top: string) {
  return [...top].map(complementBase).join('')
}

/** Fixed bright blue for Destination Vector nucleotide-ends highlight. */
export const GATEWAY_DESTINATION_ENDS_COLOR = '#3b82f6'

/** Pick black or white ink for readable nucleotides on `hex` backgrounds. */
export function contrastingInk(hex: string): '#111111' | '#ffffff' {
  const raw = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '#111111'
  const channel = (index: number) => parseInt(raw.slice(index, index + 2), 16) / 255
  const toLinear = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  const r = toLinear(channel(0))
  const g = toLinear(channel(2))
  const b = toLinear(channel(4))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? '#111111' : '#ffffff'
}

/**
 * SnapGene-style dsDNA ends panel for an Entry (payload) or Destination (ccdB gap).
 */
export function buildGatewayLrEndsDuplex(
  part: ResolvedGatewayEntry | ResolvedGatewayDestination,
): GatewayLrEndsDuplex {
  const highlightColor =
    part.role === 'destination' ? GATEWAY_DESTINATION_ENDS_COLOR : part.color
  const inkColor = contrastingInk(highlightColor)
  const empty = (message: string): GatewayLrEndsDuplex => ({
    ready: false,
    message,
    color: highlightColor,
    inkColor,
    centerLabel: part.role === 'destination' ? '(To Be Replaced)' : '(To Be Inserted)',
    leftLabel: '',
    rightLabel: '',
    leftFlankChars: 0,
    rightFlankChars: 0,
    top: [],
    bottom: [],
  })

  if (!part.ready || !part.left || !part.right) {
    return empty(part.message || 'Choose a source with att sites.')
  }

  const leftCuts = gatewayAttSiteStrandCuts(part.left, part.sequence)
  const rightCuts = gatewayAttSiteStrandCuts(part.right, part.sequence)
  if (!leftCuts || !rightCuts) {
    return empty(`Could not locate recombination cores in ${part.left.name}/${part.right.name}.`)
  }

  const leftTop = leftCuts.top
  const leftBottom = leftCuts.bottom
  const rightTop = rightCuts.top
  const rightBottom = rightCuts.bottom
  if (!(leftTop < rightTop && leftBottom < rightBottom)) {
    return empty('att sites are in an unexpected order for ends display.')
  }

  const flank = 10
  const tip = 14
  const seq = part.sequence
  const centerLabel = part.role === 'destination' ? '(To Be Replaced)' : '(To Be Inserted)'
  // Wide blank insert pocket for the overlay label — ellipses sit on each tip, not here.
  const centerGapChars = Math.max(28, centerLabel.length + 10)

  const top: Array<{ text: string; role: GatewayLrEndsBaseRole }> = []
  const bottom: Array<{ text: string; role: GatewayLrEndsBaseRole }> = []

  const push = (
    start: number,
    end: number,
    topRole: GatewayLrEndsBaseRole,
    bottomRole: GatewayLrEndsBaseRole,
  ) => {
    if (end <= start) return
    const slice = seq.slice(start, end)
    top.push({ text: slice.toLowerCase(), role: topRole })
    bottom.push({ text: duplexComplement(slice).toLowerCase(), role: bottomRole })
  }

  const leftFlankStart = Math.max(0, leftTop - flank)
  const rightFlankEnd = Math.min(seq.length, rightBottom + flank)

  push(leftFlankStart, leftTop, 'flank', 'flank')
  // Left stagger: top already in fragment, bottom still outside.
  push(leftTop, leftBottom, 'insert', 'flank')
  push(leftBottom, Math.min(leftBottom + tip, rightTop), 'insert', 'insert')
  top.push({ text: '...', role: 'insert' })
  bottom.push({ text: '...', role: 'insert' })
  const gap = ' '.repeat(centerGapChars)
  top.push({ text: gap, role: 'gap' })
  bottom.push({ text: gap, role: 'gap' })
  top.push({ text: '...', role: 'insert' })
  bottom.push({ text: '...', role: 'insert' })
  push(Math.max(rightTop - tip, leftBottom + tip), rightTop, 'insert', 'insert')
  // Right stagger: top already outside, bottom still in fragment.
  push(rightTop, rightBottom, 'flank', 'insert')
  push(rightBottom, rightFlankEnd, 'flank', 'flank')

  return {
    ready: true,
    message: part.message,
    color: highlightColor,
    inkColor,
    centerLabel,
    leftLabel: formatAttSiteArrowLabel(part.left, 'left'),
    rightLabel: formatAttSiteArrowLabel(part.right, 'right'),
    leftFlankChars: leftTop - leftFlankStart,
    rightFlankChars: rightFlankEnd - rightBottom,
    top,
    bottom,
  }
}

/**
 * Multi-insert LR “how fragments insert” diagram model.
 * Matched junctions get crossover Xs; mismatched fragments are desaturated in the UI.
 */
export function buildGatewayLrAssemblyDiagram(
  entries: ResolvedGatewayEntry[],
  destination: ResolvedGatewayDestination,
): GatewayLrAssemblyDiagram {
  const destLeft = destination.left
  const destRight = destination.right
  if (!destination.ready || !destLeft || !destRight) {
    return {
      ready: false,
      message: destination.message || 'Choose a Destination Vector.',
      destination: {
        color: destination.color,
        leftName: destLeft?.name ?? 'attR',
        rightName: destRight?.name ?? 'attR',
      },
      fragments: [],
      junctions: [],
      productSiteLabels: [],
      allMatched: false,
    }
  }

  const readyEntries = entries.filter((entry) => entry.ready && entry.left && entry.right)
  if (readyEntries.length === 0) {
    return {
      ready: false,
      message: 'Load Entry Clone(s) to preview fragment insertion.',
      destination: {
        color: destination.color,
        leftName: destLeft.name,
        rightName: destRight.name,
      },
      fragments: [],
      junctions: [],
      productSiteLabels: [],
      allMatched: false,
    }
  }

  const junctions: GatewayLrAssemblyJunction[] = []
  const first = readyEntries[0]!
  junctions.push({
    leftName: destLeft.name,
    rightName: first.left!.name,
    compatible: gatewayLrSitesCompatible(destLeft, first.left!),
  })
  for (let i = 0; i < readyEntries.length - 1; i++) {
    const left = readyEntries[i]!
    const right = readyEntries[i + 1]!
    junctions.push({
      leftName: left.right!.name,
      rightName: right.left!.name,
      compatible: gatewayLrSitesCompatible(left.right!, right.left!),
    })
  }
  const last = readyEntries[readyEntries.length - 1]!
  junctions.push({
    leftName: last.right!.name,
    rightName: destRight.name,
    compatible: gatewayLrSitesCompatible(last.right!, destRight),
  })

  const fragments: GatewayLrAssemblyFragment[] = readyEntries.map((entry, index) => {
    const leftOk = junctions[index]?.compatible ?? false
    const rightOk = junctions[index + 1]?.compatible ?? false
    return {
      index,
      color: entry.color,
      leftName: entry.left!.name,
      rightName: entry.right!.name,
      matched: leftOk && rightOk,
      row: (index % 2 === 0 ? 0 : 1) as 0 | 1,
    }
  })

  const allMatched = junctions.every((junction) => junction.compatible)
  const productSiteLabels = allMatched
    ? [
        lrProductAttBLabel(destLeft.subtype),
        ...readyEntries.slice(0, -1).map((entry) => lrProductAttBLabel(entry.right!.subtype)),
        lrProductAttBLabel(destRight.subtype),
      ]
    : []

  return {
    ready: true,
    message: allMatched
      ? 'Matching att sites — fragments insert as shown.'
      : 'Some att sites do not match — crossovers omitted for incompatible junctions.',
    destination: {
      color: destination.color,
      leftName: destLeft.name,
      rightName: destRight.name,
    },
    fragments,
    junctions,
    productSiteLabels,
    allMatched,
  }
}
