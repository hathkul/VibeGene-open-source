import enzymeRecords from '../data/enzymes.json' with { type: 'json' }
import { effectiveHostMethylation } from './constructProperties'
import {
  buildMethylationContext,
  resolveSiteMethylationFromRules,
  shouldIncludeRestrictionSite,
  type MethylationContext,
} from './methylationRules'
import type { ConstructProperties, HostMethylationStatus, RestrictionEnzyme, RestrictionSite, Topology } from './types'
import { normalizeDna, reverseComplement } from './sequence'

const iupacToRegex: Record<string, string> = {
  A: 'A',
  C: 'C',
  G: 'G',
  T: 'T',
  R: '[AG]',
  Y: '[CT]',
  S: '[GC]',
  W: '[AT]',
  K: '[GT]',
  M: '[AC]',
  B: '[CGT]',
  D: '[AGT]',
  H: '[ACT]',
  V: '[ACG]',
  N: '[ACGT]',
}

export const enzymes = enzymeRecords as RestrictionEnzyme[]

/** Whether either strand's cleavage boundary falls outside a linear sequence. */
export function restrictionSiteCutsOutsideSequence(site: RestrictionSite, sequenceLength: number) {
  return site.cutTop < 0 || site.cutTop > sequenceLength || site.cutBottom < 0 || site.cutBottom > sequenceLength
}

function compareStableText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function safeMod(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus
}

function recognitionToRegex(recognition: string) {
  return recognition
    .toUpperCase()
    .split('')
    .map((base) => iupacToRegex[base] ?? base)
    .join('')
}

/** True when the motif equals its reverse complement (IUPAC-aware). */
export function isPalindromicRecognition(recognition: string) {
  const normalized = recognition.toUpperCase()
  return normalized === reverseComplement(normalized)
}

export type RestrictionScanOptions = {
  host?: HostMethylationStatus
  construct?: ConstructProperties
  topology?: Topology
  annotateMethylation?: boolean
  /** Retain at most N sites per enzyme (useful for unique/dual preview counts). */
  maxSitesPerEnzyme?: number
  /** Bypass result memoization (benchmarks/tests). */
  noCache?: boolean
}

type PatternVariant = {
  enzyme: RestrictionEnzyme
  orientation: 'forward' | 'reverse'
}

type CompiledPattern = {
  source: string
  masks: Uint8Array
  anchor: string
  anchorOffset: number
  variants: PatternVariant[]
}

type RestrictionScanCacheEntry = {
  sequence: string
  topology: Topology
  hostKey: string
  poolKey: string
  annotateMethylation: boolean
  maxSitesPerEnzyme: number | null
  sites: RestrictionSite[]
}

const baseMask: Record<string, number> = {
  A: 1,
  C: 2,
  G: 4,
  T: 8,
  R: 1 | 4,
  Y: 2 | 8,
  S: 2 | 4,
  W: 1 | 8,
  K: 4 | 8,
  M: 1 | 2,
  B: 2 | 4 | 8,
  D: 1 | 4 | 8,
  H: 1 | 2 | 8,
  V: 1 | 2 | 4,
  N: 1 | 2 | 4 | 8,
}

const compiledPoolCache = new Map<string, CompiledPattern[]>()
const restrictionScanCache: RestrictionScanCacheEntry[] = []

function enzymePoolKey(enzymeSet: RestrictionEnzyme[]) {
  return enzymeSet
    .map(
      (enzyme) =>
        `${enzyme.name}:${enzyme.recognition}:${enzyme.cutTop}:${enzyme.cutBottom}`,
    )
    .join('\0')
}

function hostKey(host: HostMethylationStatus) {
  return `${host.dam ? 1 : 0}${host.dcm ? 1 : 0}${host.ecoKI ? 1 : 0}`
}

function longestExactAnchor(pattern: string) {
  let best = ''
  let bestOffset = 0
  let current = ''
  let currentOffset = 0
  for (let index = 0; index < pattern.length; index += 1) {
    const base = pattern[index]!
    if (base === 'A' || base === 'C' || base === 'G' || base === 'T') {
      if (!current) currentOffset = index
      current += base
      if (current.length > best.length) {
        best = current
        bestOffset = currentOffset
      }
    } else {
      current = ''
    }
  }
  // The catalog currently always has an exact anchor. Keep a safe all-position fallback.
  return { anchor: best, anchorOffset: bestOffset }
}

function compileEnzymePool(enzymeSet: RestrictionEnzyme[]) {
  const key = enzymePoolKey(enzymeSet)
  const cached = compiledPoolCache.get(key)
  if (cached) return cached

  const byPattern = new Map<string, PatternVariant[]>()
  for (const enzyme of enzymeSet) {
    const add = (source: string, orientation: PatternVariant['orientation']) => {
      const variants = byPattern.get(source) ?? []
      variants.push({ enzyme, orientation })
      byPattern.set(source, variants)
    }
    const recognition = enzyme.recognition.toUpperCase()
    add(recognition, 'forward')
    if (!isPalindromicRecognition(recognition)) add(reverseComplement(recognition), 'reverse')
  }

  const compiled = [...byPattern.entries()].map(([source, variants]): CompiledPattern => ({
    source,
    masks: Uint8Array.from(source, (base) => baseMask[base] ?? 0),
    ...longestExactAnchor(source),
    variants,
  }))
  compiledPoolCache.set(key, compiled)
  if (compiledPoolCache.size > 12) compiledPoolCache.delete(compiledPoolCache.keys().next().value!)
  return compiled
}

function sequenceBaseCodes(sequence: string) {
  return Uint8Array.from(sequence, (base) =>
    base === 'A' || base === 'C' || base === 'G' || base === 'T' ? baseMask[base]! : 0,
  )
}

function patternMatchesAt(pattern: CompiledPattern, sequenceCodes: Uint8Array, start: number) {
  for (let offset = 0; offset < pattern.masks.length; offset += 1) {
    if (!(pattern.masks[offset]! & sequenceCodes[start + offset]!)) return false
  }
  return true
}

function resolvedHost(options?: RestrictionScanOptions) {
  return (
    options?.host ??
    (options?.construct ? effectiveHostMethylation(options.construct) : { dam: true, dcm: true, ecoKI: true })
  )
}

function makeSite(
  variant: PatternVariant,
  start: number,
  matchText: string,
  sequenceLength: number,
  topology: Topology,
): RestrictionSite {
  const recognitionLength = variant.enzyme.recognition.length
  const cutTop =
    variant.orientation === 'forward'
      ? start + variant.enzyme.cutTop
      : start + recognitionLength - variant.enzyme.cutBottom
  const cutBottom =
    variant.orientation === 'forward'
      ? start + variant.enzyme.cutBottom
      : start + recognitionLength - variant.enzyme.cutTop
  return {
    enzyme: variant.enzyme,
    start,
    end: topology === 'circular' ? (start + matchText.length) % sequenceLength : start + matchText.length,
    match: matchText,
    cutTop: topology === 'circular' ? safeMod(cutTop, sequenceLength) : cutTop,
    cutBottom: topology === 'circular' ? safeMod(cutBottom, sequenceLength) : cutBottom,
  }
}

function appendCompiledPatternSites(
  sites: RestrictionSite[],
  pattern: CompiledPattern,
  searchable: string,
  sequenceCodes: Uint8Array,
  sequenceLength: number,
  host: HostMethylationStatus,
  originalSequence: string,
  topology: Topology,
  methylationContext: MethylationContext,
  annotateMethylation: boolean,
  siteCounts: Map<string, number>,
  maxSitesPerEnzyme: number | null,
) {
  const visitStart = (start: number) => {
    if (
      start < 0 ||
      start >= sequenceLength ||
      start + pattern.source.length > searchable.length ||
      !patternMatchesAt(pattern, sequenceCodes, start)
    ) {
      return
    }
    const matchText = searchable.slice(start, start + pattern.source.length)
    for (const variant of pattern.variants) {
      const currentCount = siteCounts.get(variant.enzyme.name) ?? 0
      if (maxSitesPerEnzyme !== null && currentCount >= maxSitesPerEnzyme) continue
      const site = makeSite(variant, start, matchText, sequenceLength, topology)
      if (shouldIncludeRestrictionSite(variant.enzyme, site, originalSequence, host, methylationContext)) {
        siteCounts.set(variant.enzyme.name, currentCount + 1)
        sites.push(
          annotateMethylation
            ? {
                ...site,
                methylationDisplay: resolveSiteMethylationFromRules(
                  site,
                  originalSequence,
                  host,
                  methylationContext,
                ),
              }
            : site,
        )
      }
    }
  }

  if (!pattern.anchor) {
    for (let start = 0; start < sequenceLength; start += 1) {
      visitStart(start)
      if (
        maxSitesPerEnzyme !== null &&
        pattern.variants.every(
          (variant) => (siteCounts.get(variant.enzyme.name) ?? 0) >= maxSitesPerEnzyme,
        )
      ) {
        break
      }
    }
    return
  }
  let anchorIndex = searchable.indexOf(pattern.anchor)
  while (anchorIndex >= 0) {
    visitStart(anchorIndex - pattern.anchorOffset)
    if (
      maxSitesPerEnzyme !== null &&
      pattern.variants.every(
        (variant) => (siteCounts.get(variant.enzyme.name) ?? 0) >= maxSitesPerEnzyme,
      )
    ) {
      break
    }
    anchorIndex = searchable.indexOf(pattern.anchor, anchorIndex + 1)
  }
}

function cachedRestrictionSites(
  sequence: string,
  topology: Topology,
  host: HostMethylationStatus,
  poolKey: string,
  annotateMethylation: boolean,
  maxSitesPerEnzyme: number | null,
) {
  return restrictionScanCache.find(
    (entry) =>
      entry.sequence === sequence &&
      entry.topology === topology &&
      entry.hostKey === hostKey(host) &&
      entry.poolKey === poolKey &&
      entry.annotateMethylation === annotateMethylation &&
      entry.maxSitesPerEnzyme === maxSitesPerEnzyme,
  )?.sites
}

function rememberRestrictionSites(entry: RestrictionScanCacheEntry) {
  restrictionScanCache.unshift(entry)
  if (restrictionScanCache.length > 4) restrictionScanCache.pop()
}

export function clearRestrictionSiteCache() {
  restrictionScanCache.length = 0
}

/**
 * Legacy per-enzyme RegExp scanner retained for correctness/performance comparisons.
 * It shares the optimized methylation index, so benchmark its matching algorithm only.
 */
export function findRestrictionSitesLegacy(
  sequence: string,
  enzymeSet = enzymes,
  options?: RestrictionScanOptions,
): RestrictionSite[] {
  const normalized = normalizeDna(sequence)
  const topology = options?.topology ?? 'circular'
  const maxRecognitionLength = Math.max(1, ...enzymeSet.map((enzyme) => enzyme.recognition.length))
  const searchable =
    topology === 'circular' ? normalized + normalized.slice(0, maxRecognitionLength - 1) : normalized
  const sites: RestrictionSite[] = []
  const host = resolvedHost(options)
  const context = buildMethylationContext(normalized, topology)

  for (const enzyme of enzymeSet) {
    const append = (source: string, orientation: PatternVariant['orientation']) => {
      const regex = new RegExp(`(?=(${recognitionToRegex(source)}))`, 'g')
      let match = regex.exec(searchable)
      while (match) {
        const start = match.index
        const matchText = match[1] ?? ''
        if (start < normalized.length && (topology === 'circular' || start + matchText.length <= normalized.length)) {
          const site = makeSite({ enzyme, orientation }, start, matchText, normalized.length, topology)
          if (shouldIncludeRestrictionSite(enzyme, site, normalized, host, context)) {
            sites.push(
              options?.annotateMethylation
                ? {
                    ...site,
                    methylationDisplay: resolveSiteMethylationFromRules(site, normalized, host, context),
                  }
                : site,
            )
          }
        }
        regex.lastIndex = match.index + 1
        match = regex.exec(searchable)
      }
    }
    append(enzyme.recognition, 'forward')
    if (!isPalindromicRecognition(enzyme.recognition)) append(reverseComplement(enzyme.recognition), 'reverse')
  }
  return sites.sort((a, b) => a.start - b.start || compareStableText(a.enzyme.name, b.enzyme.name))
}

export function findRestrictionSites(
  sequence: string,
  enzymeSet = enzymes,
  options?: RestrictionScanOptions,
): RestrictionSite[] {
  const normalized = normalizeDna(sequence)
  if (!normalized.length || !enzymeSet.length) return []
  const topology = options?.topology ?? 'circular'
  const host = resolvedHost(options)
  const poolKey = enzymePoolKey(enzymeSet)
  const annotateMethylation = options?.annotateMethylation ?? false
  const maxSitesPerEnzyme =
    options?.maxSitesPerEnzyme === undefined
      ? null
      : Math.max(1, Math.floor(options.maxSitesPerEnzyme))
  if (!options?.noCache) {
    const cached = cachedRestrictionSites(
      normalized,
      topology,
      host,
      poolKey,
      annotateMethylation,
      maxSitesPerEnzyme,
    )
    if (cached) return cached
  }

  const patterns = compileEnzymePool(enzymeSet)
  const maxRecognitionLength = Math.max(1, ...patterns.map((pattern) => pattern.source.length))
  const searchable =
    topology === 'circular' ? normalized + normalized.slice(0, maxRecognitionLength - 1) : normalized
  const sequenceCodes = sequenceBaseCodes(searchable)
  const methylationContext = buildMethylationContext(normalized, topology)
  const sites: RestrictionSite[] = []
  const siteCounts = new Map<string, number>()

  for (const pattern of patterns) {
    appendCompiledPatternSites(
      sites,
      pattern,
      searchable,
      sequenceCodes,
      normalized.length,
      host,
      normalized,
      topology,
      methylationContext,
      annotateMethylation,
      siteCounts,
      maxSitesPerEnzyme,
    )
  }

  sites.sort((a, b) => a.start - b.start || compareStableText(a.enzyme.name, b.enzyme.name))
  if (!options?.noCache) {
    rememberRestrictionSites({
      sequence: normalized,
      topology,
      hostKey: hostKey(host),
      poolKey,
      annotateMethylation,
      maxSitesPerEnzyme,
      sites,
    })
  }
  return sites
}

export function digestSummary(sequence: string, selectedEnzymes: string[]) {
  const selected = enzymes.filter((enzyme) => selectedEnzymes.includes(enzyme.name))
  const sites = findRestrictionSites(sequence, selected)
  const cutPositions = [...new Set(sites.map((site) => site.cutTop))].sort((a, b) => a - b)

  if (cutPositions.length === 0) {
    return { sites, fragments: [normalizeDna(sequence).length] }
  }

  const length = normalizeDna(sequence).length
  const fragments = cutPositions.map((position, index) => {
    const next = cutPositions[(index + 1) % cutPositions.length]
    return next > position ? next - position : length - position + next
  })

  return { sites, fragments: fragments.sort((a, b) => b - a) }
}
