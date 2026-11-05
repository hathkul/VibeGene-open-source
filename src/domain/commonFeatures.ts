import { defaultConstructProperties } from './constructProperties'
import {
  parseFeatureQualifiers,
  serializeFeatureQualifiers,
} from './featureQualifiers'
import { defaultFeatureTranslationOptions } from './geneticCode'
import { createId, featureBounds, normalizeDna, nowIso, reverseComplement } from './sequence'
import type {
  FeatureSegment,
  FeatureTranslationOptions,
  SequenceFeature,
  SequenceRecord,
  Strand,
  Topology,
} from './types'

export type CommonFeatureQualifier = {
  name: string
  value: string
}

export type CommonFeatureTemplate = {
  id: string
  fileName: string
  name: string
  type: string
  color: string
  sequence: string
  notes?: string
  qualifiers: CommonFeatureQualifier[]
  locations: FeatureSegment[]
  cleavageArrows?: number[]
  translateInSequenceView?: boolean
  translation?: FeatureTranslationOptions
  prioritizeDisplay?: boolean
}

export type CommonFeatureMatch = {
  id: string
  templateId: string
  template: CommonFeatureTemplate
  start: number
  end: number
  strand: Strand
  matchPercent: number
  matchedSegments: Array<{ start: number; end: number }>
  alreadyPresent: boolean
  feature: SequenceFeature
}

export type CommonFeatureDetectionOptions = {
  /** Requested identity floor. Short templates are automatically held to stricter floors. */
  minimumIdentityPercent?: number
  /** Receives coarse progress after each library template has been scanned. */
  onProgress?: (completed: number, total: number) => void
}

let builtInCommonFeaturesCache: CommonFeatureTemplate[] | null = null

/** Lazily loads the bundled standard-feature library (kept out of the initial app chunk). */
export async function loadBuiltInCommonFeatures(): Promise<CommonFeatureTemplate[]> {
  if (builtInCommonFeaturesCache) return builtInCommonFeaturesCache
  const module = await import('../data/commonFeatures.json')
  builtInCommonFeaturesCache = module.default as CommonFeatureTemplate[]
  return builtInCommonFeaturesCache
}

export function getBuiltInCommonFeatures(): CommonFeatureTemplate[] {
  return builtInCommonFeaturesCache ?? []
}

function clampIndex(value: number, sequenceLength: number) {
  if (sequenceLength <= 0) return 0
  const mod = value % sequenceLength
  return mod < 0 ? mod + sequenceLength : mod
}

/** Exact (possibly wrapping) occurrences of `needle` in `haystack`. */
export function findExactDnaHits(haystack: string, needle: string, topology: Topology): number[] {
  const sequence = normalizeDna(haystack)
  const query = normalizeDna(needle)
  if (!query || query.length > sequence.length) return []
  if (topology !== 'circular') {
    const hits: number[] = []
    let index = sequence.indexOf(query)
    while (index !== -1) {
      hits.push(index)
      index = sequence.indexOf(query, index + 1)
    }
    return hits
  }
  const searchIn = sequence + sequence.slice(0, Math.max(0, query.length - 1))
  const hits: number[] = []
  let index = searchIn.indexOf(query)
  while (index !== -1) {
    if (index < sequence.length) hits.push(index)
    index = searchIn.indexOf(query, index + 1)
  }
  return hits
}

function effectiveIdentityFloor(length: number, requested: number) {
  if (length < 30) return 100
  if (length < 60) return Math.max(98, requested)
  if (length < 120) return Math.max(95, requested)
  return requested
}

export function findApproximateDnaHits(
  haystack: string,
  needle: string,
  topology: Topology,
  minimumIdentityPercent: number,
): Array<{ start: number; matchPercent: number; matchedSegments: Array<{ start: number; end: number }> }> {
  const sequence = normalizeDna(haystack)
  const query = normalizeDna(needle)
  if (!query || query.length > sequence.length) return []
  const floor = Math.max(80, Math.min(100, minimumIdentityPercent))
  if (floor >= 100) return findExactDnaHits(sequence, query, topology).map((start) => ({ start, matchPercent: 100, matchedSegments: [{ start: 0, end: query.length }] }))
  const maximumMismatches = Math.floor(query.length * (100 - floor) / 100)
  if (maximumMismatches <= 0) return findExactDnaHits(sequence, query, topology).map((start) => ({ start, matchPercent: 100, matchedSegments: [{ start: 0, end: query.length }] }))
  const searchIn = topology === 'circular'
    ? sequence + sequence.slice(0, Math.max(0, query.length - 1))
    : sequence
  const lastStart = topology === 'circular' ? sequence.length - 1 : sequence.length - query.length
  const hits: Array<{ start: number; matchPercent: number; matchedSegments: Array<{ start: number; end: number }> }> = []
  // Any window with at most k mismatches must contain one exact segment when
  // split into k+1 pieces. Seed candidates first so large DNA molecules do not
  // require a full template comparison at every base.
  const candidates = new Set<number>()
  const segmentCount = maximumMismatches + 1
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const offset = Math.floor(segment * query.length / segmentCount)
    const end = Math.floor((segment + 1) * query.length / segmentCount)
    const seed = query.slice(offset, end)
    let index = searchIn.indexOf(seed)
    while (index !== -1) {
      let start = index - offset
      if (topology === 'circular') start = clampIndex(start, sequence.length)
      if (start >= 0 && start <= lastStart) candidates.add(start)
      index = searchIn.indexOf(seed, index + 1)
    }
  }
  for (const start of candidates) {
    let mismatches = 0
    const matchedSegments: Array<{ start: number; end: number }> = []
    let matchedStart: number | null = null
    for (let offset = 0; offset < query.length; offset += 1) {
      if (searchIn[start + offset] !== query[offset]) {
        if (matchedStart !== null) matchedSegments.push({ start: matchedStart, end: offset })
        matchedStart = null
        mismatches += 1
        if (mismatches > maximumMismatches) break
      } else if (matchedStart === null) {
        matchedStart = offset
      }
    }
    if (mismatches <= maximumMismatches) {
      if (matchedStart !== null) matchedSegments.push({ start: matchedStart, end: query.length })
      hits.push({ start, matchPercent: (query.length - mismatches) / query.length * 100, matchedSegments })
    }
  }
  return hits
}

function mapLibrarySegmentToHit(
  segment: FeatureSegment,
  hitStart: number,
  libraryLength: number,
  hitStrand: Strand,
  sequenceLength: number,
): FeatureSegment {
  if (hitStrand === 'forward') {
    const start = clampIndex(hitStart + segment.start, sequenceLength)
    const end = clampIndex(hitStart + segment.end, sequenceLength)
    // Non-wrapping library segments usually stay non-wrapping unless the hit itself wraps.
    if (segment.end > segment.start && hitStart + segment.end <= sequenceLength && hitStart + segment.start < sequenceLength) {
      return { start: hitStart + segment.start, end: hitStart + segment.end, strand: segment.strand === 'reverse' ? 'reverse' : 'forward' }
    }
    return {
      start,
      end: end === 0 && hitStart + segment.end >= sequenceLength ? sequenceLength : end,
      strand: segment.strand === 'reverse' ? 'reverse' : 'forward',
    }
  }

  // Reverse-complement hit: library coordinate x maps to hitStart + (L - x).
  const mappedStart = hitStart + (libraryLength - segment.end)
  const mappedEnd = hitStart + (libraryLength - segment.start)
  const strand: Strand = segment.strand === 'reverse' ? 'forward' : 'reverse'
  if (mappedEnd <= sequenceLength) {
    return { start: mappedStart, end: mappedEnd, strand }
  }
  return {
    start: clampIndex(mappedStart, sequenceLength),
    end: clampIndex(mappedEnd, sequenceLength),
    strand,
  }
}

function mapLibraryCleavageToHit(
  cleavage: number,
  hitStart: number,
  libraryLength: number,
  hitStrand: Strand,
  sequenceLength: number,
): number {
  const absolute =
    hitStrand === 'forward' ? hitStart + cleavage : hitStart + (libraryLength - cleavage)
  return clampIndex(absolute, sequenceLength)
}

function mergeCommonFeatureQualifiers(template: CommonFeatureTemplate): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const qualifier of template.qualifiers) {
    const value = qualifier.value.trim()
    if (value) merged[qualifier.name] = value
  }
  for (const [name, value] of Object.entries(parseFeatureQualifiers(template.notes))) {
    if (value.trim()) merged[name] = value.trim()
  }
  return merged
}

function notesFromCommonFeatureTemplate(template: CommonFeatureTemplate): string | undefined {
  const merged = mergeCommonFeatureQualifiers(template)
  const serialized = serializeFeatureQualifiers(merged)
  if (serialized) return serialized
  return template.notes?.trim() || undefined
}

/** CDS templates with /product (or an explicit translate flag) show AA rows in Sequence. */
export function shouldTranslateCommonFeature(template: CommonFeatureTemplate): boolean {
  if (template.translateInSequenceView) return true
  if (template.type.trim().toUpperCase() !== 'CDS') return false
  return Boolean(mergeCommonFeatureQualifiers(template).product?.trim())
}

export function featureFromCommonMatch(
  template: CommonFeatureTemplate,
  hitStart: number,
  hitStrand: Strand,
  sequenceLength: number,
  matchedSegments?: Array<{ start: number; end: number }>,
  matchPercent = 100,
): SequenceFeature {
  const libraryLength = template.sequence.length
  const coversWholeLibrary =
    template.locations.length === 1 &&
    template.locations[0].start === 0 &&
    template.locations[0].end === libraryLength

  let locations: FeatureSegment[]
  if (coversWholeLibrary || template.locations.length === 0) {
    if (hitStart + libraryLength <= sequenceLength) {
      locations = [{ start: hitStart, end: hitStart + libraryLength, strand: hitStrand }]
    } else {
      locations = [
        {
          start: hitStart,
          end: (hitStart + libraryLength) % sequenceLength,
          strand: hitStrand,
        },
      ]
    }
  } else {
    locations = template.locations.map((segment) =>
      mapLibrarySegmentToHit(segment, hitStart, libraryLength, hitStrand, sequenceLength),
    )
  }

  if (matchedSegments && matchPercent < 100) {
    const orientedTemplateLocations = (template.locations.length ? template.locations : [{ start: 0, end: libraryLength, strand: 'forward' as Strand }])
      .map((location) => hitStrand === 'forward'
        ? { start: location.start, end: location.end }
        : { start: libraryLength - location.end, end: libraryLength - location.start })
    locations = matchedSegments.flatMap((matched) => orientedTemplateLocations.flatMap((templateLocation) => {
      const startOffset = Math.max(matched.start, templateLocation.start)
      const endOffset = Math.min(matched.end, templateLocation.end)
      if (endOffset <= startOffset) return []
      const absoluteStart = hitStart + startOffset
      const absoluteEnd = hitStart + endOffset
      return [{
        start: clampIndex(absoluteStart, sequenceLength),
        end: absoluteEnd === sequenceLength ? sequenceLength : clampIndex(absoluteEnd, sequenceLength),
        strand: hitStrand,
      }]
    }))
  }

  const cleavageArrows = template.cleavageArrows?.map((position) =>
    mapLibraryCleavageToHit(position, hitStart, libraryLength, hitStrand, sequenceLength),
  )

  const translateInSequenceView = shouldTranslateCommonFeature(template)
  const baseNotes = notesFromCommonFeatureTemplate(template)

  return {
    id: createId('feature'),
    name: template.name,
    type: template.type,
    color: template.color,
    notes: `${baseNotes ?? ''}${matchPercent < 100 ? `${baseNotes ? ' ' : ''}/note="Partial ${matchPercent.toFixed(1)}% match; non-matching bases omitted"` : ''}` || undefined,
    locations,
    ...(cleavageArrows?.length ? { cleavageArrows } : {}),
    ...(translateInSequenceView ? { translateInSequenceView: true } : {}),
    ...(template.translation
      ? { translation: template.translation }
      : translateInSequenceView
        ? { translation: defaultFeatureTranslationOptions(locations.length) }
        : {}),
    ...(template.prioritizeDisplay ? { prioritizeDisplay: true } : {}),
  }
}

export function isCommonFeatureAlreadyPresent(
  record: SequenceRecord,
  candidate: Pick<SequenceFeature, 'name' | 'locations'>,
): boolean {
  const starts = candidate.locations.map((location) => location.start)
  const ends = candidate.locations.map((location) => location.end)
  const start = Math.min(...starts)
  const end = Math.max(...ends)
  const strand = candidate.locations[0]?.strand ?? 'forward'
  const nameKey = candidate.name.trim().toLowerCase()
  return record.features.some((feature) => {
    if (feature.name.trim().toLowerCase() !== nameKey) return false
    const existing = featureBounds(feature)
    const existingStrand = feature.locations[0]?.strand ?? 'forward'
    return existing.start === start && existing.end === end && existingStrand === strand
  })
}

export function detectCommonFeatures(
  record: SequenceRecord,
  templates: CommonFeatureTemplate[],
  options?: CommonFeatureDetectionOptions,
): CommonFeatureMatch[] {
  const sequence = normalizeDna(record.sequence)
  const topology = record.topology
  const sequenceLength = sequence.length
  const matches: CommonFeatureMatch[] = []

  for (let templateIndex = 0; templateIndex < templates.length; templateIndex += 1) {
    const template = templates[templateIndex]!
    const query = normalizeDna(template.sequence)
    if (!query) {
      options?.onProgress?.(templateIndex + 1, templates.length)
      continue
    }

    const requestedIdentity = Math.max(80, Math.min(100, options?.minimumIdentityPercent ?? 100))
    const identityFloor = effectiveIdentityFloor(query.length, requestedIdentity)
    for (const { start, matchPercent, matchedSegments } of findApproximateDnaHits(sequence, query, topology, identityFloor)) {
      const feature = featureFromCommonMatch(template, start, 'forward', sequenceLength, matchedSegments, matchPercent)
      const bounds = featureBounds(feature)
      matches.push({
        id: `${template.id}:fwd:${start}`,
        templateId: template.id,
        template,
        start: bounds.start,
        end: bounds.end,
        strand: 'forward',
        matchPercent,
        matchedSegments,
        alreadyPresent: isCommonFeatureAlreadyPresent(record, feature),
        feature,
      })
    }

    const rc = reverseComplement(query)
    if (rc !== query) {
      for (const { start, matchPercent, matchedSegments } of findApproximateDnaHits(sequence, rc, topology, identityFloor)) {
        const feature = featureFromCommonMatch(template, start, 'reverse', sequenceLength, matchedSegments, matchPercent)
        const bounds = featureBounds(feature)
        matches.push({
          id: `${template.id}:rev:${start}`,
          templateId: template.id,
          template,
          start: bounds.start,
          end: bounds.end,
          strand: 'reverse',
          matchPercent,
          matchedSegments,
          alreadyPresent: isCommonFeatureAlreadyPresent(record, feature),
          feature,
        })
      }
    }
    options?.onProgress?.(templateIndex + 1, templates.length)
  }

  matches.sort((a, b) => a.start - b.start || a.end - b.end || a.template.name.localeCompare(b.template.name))
  return preferLongestSameNameMatches(matches)
}

/**
 * Same-named library entries are length variants of one feature. Keep only hits
 * from the longest matching variant (all genomic sites of that variant remain).
 */
export function preferLongestSameNameMatches(matches: CommonFeatureMatch[]): CommonFeatureMatch[] {
  const maxLengthByName = new Map<string, number>()
  for (const match of matches) {
    const key = match.template.name.trim().toLowerCase()
    const length = match.template.sequence.length
    const previous = maxLengthByName.get(key) ?? 0
    if (length > previous) maxLengthByName.set(key, length)
  }
  return matches.filter((match) => {
    const key = match.template.name.trim().toLowerCase()
    return match.template.sequence.length === maxLengthByName.get(key)
  })
}

export function formatCommonFeatureQualifierLines(template: CommonFeatureTemplate): string[] {
  const merged = mergeCommonFeatureQualifiers(template)
  const entries = Object.entries(merged).filter(([, value]) => value.trim())
  if (entries.length) {
    return entries.map(([name, value]) => `/${name} = ${value}`)
  }
  if (template.notes?.trim()) return [`/note = ${template.notes.trim()}`]
  return []
}

/** Temporary linear DNA document for browsing a common-feature template. */
export function recordFromCommonFeatureTemplate(template: CommonFeatureTemplate): SequenceRecord {
  const sequence = normalizeDna(template.sequence)
  const feature =
    sequence.length > 0
      ? featureFromCommonMatch(template, 0, 'forward', sequence.length)
      : {
          id: createId('feature'),
          name: template.name,
          type: template.type,
          color: template.color,
          notes: template.notes,
          locations: [] as FeatureSegment[],
        }
  const stamp = nowIso()
  return {
    id: createId('common-preview'),
    name: template.name,
    description: template.notes ?? '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [{ ...feature, id: 'common-preview-feature' }],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties, syntheticDna: true },
    createdAt: stamp,
    updatedAt: stamp,
  }
}

const AA_MASS: Record<string, number> = {
  A: 71.03711,
  R: 156.10111,
  N: 114.04293,
  D: 115.02694,
  C: 103.00919,
  E: 129.04259,
  Q: 128.05858,
  G: 57.02146,
  H: 137.05891,
  I: 113.08406,
  L: 113.08406,
  K: 128.09496,
  M: 131.04049,
  F: 147.06841,
  P: 97.05276,
  S: 87.03203,
  T: 101.04768,
  W: 186.07931,
  Y: 163.06333,
  V: 99.06841,
  U: 150.95363,
  O: 237.14773,
}

/** Approximate average residue mass (peptide bond water already accounted in residue masses). */
export function peptideMassDa(peptide: string): number {
  const cleaned = peptide.replace(/\*|-/g, '').toUpperCase()
  if (!cleaned) return 0
  let mass = 18.01056 // terminal H + OH
  for (const aa of cleaned) {
    mass += AA_MASS[aa] ?? 110
  }
  return mass
}
