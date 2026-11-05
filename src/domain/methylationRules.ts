import { normalizeDna } from './sequence'
import type { HostMethylationStatus, RestrictionEnzyme, RestrictionSite, Topology } from './types'

export type MethylaseId = 'dam' | 'dcm' | 'ecoKI'

export type MethylaseEffect =
  | 'none'
  | 'blocked_overlap'
  | 'blocked_context'
  | 'requires'
  | 'requires_5mc'

export type MethylaseRule = {
  effect: MethylaseEffect
  contextPatterns?: string[]
  note: string
}

export type EnzymeMethylationRules = Record<MethylaseId, MethylaseRule>

const NO_EFFECT: MethylaseRule = { effect: 'none', note: 'No Effect' }

const DEFAULT_RULES: EnzymeMethylationRules = {
  dam: NO_EFFECT,
  dcm: NO_EFFECT,
  ecoKI: NO_EFFECT,
}

const DAM_CONTEXT: Record<string, string[]> = {
  AlwI: ['GGATC'],
  BcgI: ['CGATCNNNNTGC'],
  BclI: ['TGATCA'],
  'BclI-HF': ['TGATCA'],
  BsaBI: ['GATCNNNATC'],
  BspDI: ['ATCGATC', 'GATCGAT'],
  BspEI: ['TCCGGATC'],
  BspHI: ['TCATGATC'],
  ClaI: ['ATCGATC', 'GATCGAT'],
  DpnII: ['GATC'],
  HphI: ['GGTGATC'],
  Hpy188I: ['TCNGATC'],
  Hpy188III: ['TCNNGATC'],
  MboI: ['GATC'],
  MboII: ['GAAGATC'],
  NruI: ['TCGCGATC'],
  Sau3AI: ['GATC'],
  TaqAI: ['TCGATC'],
  'TaqαI': ['TCGATC'],
  XbaI: ['GATCTAGA', 'TCTAGATC'],
}

const DCM_CONTEXT: Record<string, string[]> = {
  Acc65I: ['GGTACCAGG', 'GGTACCTGG'],
  AlwNI: ['CAGNNCCTGG', 'CAGNNCCAGG'],
  ApaI: ['GGGCCCAGG', 'GGGCCCTGG'],
  AvaII: ['GGACCAGG', 'GGACCTGG', 'GGTCCAGG', 'GGTCCTGG'],
  BanI: ['GGYRCCAGG', 'GGYRCCTGG'],
  'BsaI': ['GGTCTCCAGG', 'GGTCTCCTGG', 'GAGACCAGG', 'GAGACCTGG'],
  'BsaI-HFv2': ['GGTCTCCAGG', 'GGTCTCCTGG', 'GAGACCAGG', 'GAGACCTGG'],
  BsaHI: ['GRCGCCAGG', 'GRCGCCTGG'],
  BslI: ['CCAGGNNNNGG', 'CCTGGNNNNGG'],
  BsmFI: ['GGGACCAGG', 'GGGACCTGG', 'GGGACTCCAGG', 'GGGACTCCTGG'],
  BssKI: ['CCAGG', 'CCTGG'],
  BstXI: ['CCAGGNNNNTGG', 'CCTGGNNNNTGG'],
  EaeI: ['YGGCCAGG'],
  EcoO109I: ['RGGNCCTGG', 'RGGNCCAGG'],
  EcoRII: ['CCAGG', 'CCTGG'],
  FseI: ['GGCCGGCCAGG', 'GGCCGGCCTGG'],
  HpaII: ['CCAGG', 'CCTGG'],
  MscI: ['TGGCCAGG', 'TGGCCTGG'],
  NlaIV: ['GGNNCCAGG', 'GGNNCCTGG'],
  PflMI: ['CCAGGNNNTGG', 'CCTGGNNNTGG'],
  PpuMI: ['RGGWCCTGG', 'RGGWCCAGG'],
  PspGI: ['CCAGG', 'CCTGG'],
  PspOMI: ['GGGCCCAGG', 'GGGCCCTGG'],
  Sau96I: ['GGNCCAGG', 'GGNCCTGG'],
  ScrFI: ['CCAGG', 'CCTGG'],
  SexAI: ['ACCWGGT'],
  SfiI: ['GGCCNNNNNGGCCAGG', 'GGCCNNNNNGGCCTGG', 'GGCCACGGNNGGCC', 'GGCCTGGNNGGCC'],
  SfoI: ['GGCGCCAGG', 'GGCGCCTGG'],
  StuI: ['CCAGGCCT', 'AGGCCTGG'],
}

const ECO_KI_BLOCKED = new Set([
  'BanII',
  'BciVI',
  'BglI',
  'BpmI',
  'BsaJI',
  'Bsp1286I',
  'BstEII',
  'BstNI',
  'BstXI',
  'DraIII',
  'DraI',
  'HpaI',
  'KasI',
  'KpnI',
  'NarI',
  'NruI',
  'PmeI',
])

const DAM_REQUIRES = new Set(['DpnI'])
const DCM_REQUIRES_5MC = new Set(['MspJI', 'SgeI'])
const DCM_CLEAVES_BOTH = new Set(['MspI'])

const DAM_BLOCKED_NOTE = 'Blocked by Dam methylation (overlapping GATC)'
const DCM_BLOCKED_NOTE = 'Blocked by Dcm methylation (overlapping CCWGG)'
const ECO_KI_BLOCKED_NOTE = 'Blocked by EcoKI methylation'

function ruleFromContext(
  _methylase: MethylaseId,
  patterns: string[] | undefined,
  blockedNote: string,
): MethylaseRule {
  if (!patterns?.length) return NO_EFFECT
  return {
    effect: 'blocked_context',
    contextPatterns: patterns,
    note: blockedNote,
  }
}

function buildEnzymeRules(enzymeName: string): EnzymeMethylationRules {
  if (DAM_REQUIRES.has(enzymeName)) {
    return {
      dam: { effect: 'requires', note: 'Requires Dam methylation' },
      dcm: NO_EFFECT,
      ecoKI: NO_EFFECT,
    }
  }

  if (DCM_REQUIRES_5MC.has(enzymeName)) {
    return {
      dam: NO_EFFECT,
      dcm: {
        effect: 'requires_5mc',
        note: 'Requires 5-methylcytosine (cleaves only methylated sites)',
      },
      ecoKI: NO_EFFECT,
    }
  }

  if (DCM_CLEAVES_BOTH.has(enzymeName)) {
    return {
      dam: NO_EFFECT,
      dcm: { effect: 'none', note: 'Cleaves methylated and unmethylated CCGG' },
      ecoKI: NO_EFFECT,
    }
  }

  const damPatterns = DAM_CONTEXT[enzymeName]
  const dcmPatterns = DCM_CONTEXT[enzymeName]

  return {
    dam: ruleFromContext('dam', damPatterns, DAM_BLOCKED_NOTE),
    dcm: ruleFromContext('dcm', dcmPatterns, DCM_BLOCKED_NOTE),
    ecoKI: ECO_KI_BLOCKED.has(enzymeName)
      ? { effect: 'blocked_overlap', note: ECO_KI_BLOCKED_NOTE }
      : NO_EFFECT,
  }
}

const enzymeRulesByName = new Map<string, EnzymeMethylationRules>()

export function methylationRulesForEnzyme(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'recognition' | 'methylationRules'>,
): EnzymeMethylationRules {
  if (enzyme.methylationRules) return enzyme.methylationRules

  const cached = enzymeRulesByName.get(enzyme.name)
  if (cached) return cached

  const rules = buildEnzymeRules(enzyme.name)
  enzymeRulesByName.set(enzyme.name, rules)
  return rules
}

export function methylationDisplayForRule(rule: MethylaseRule): string {
  if (rule.effect === 'none') return rule.note === 'No Effect' ? 'No Effect' : rule.note
  return rule.note
}

export function methylationDisplayStrings(enzyme: Pick<RestrictionEnzyme, 'name' | 'recognition'>) {
  const rules = methylationRulesForEnzyme(enzyme)
  return {
    dam: methylationDisplayForRule(rules.dam),
    dcm: methylationDisplayForRule(rules.dcm),
    ecoKI: methylationDisplayForRule(rules.ecoKI),
  }
}

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

function patternToRegex(pattern: string) {
  return pattern
    .split('')
    .map((base) => iupacToRegex[base] ?? base)
    .join('')
}

const DAM_MOTIF = /GATC/g
const DCM_MOTIF = /CC[AT]GG/g
const ECO_KI_MOTIF = /AAC[ACGT]{6}GTGC/g
const DAM_BIT = 1
const DCM_BIT = 2
const ECO_KI_BIT = 4

export type MethylationContext = {
  normalized: string
  topology: Topology
  /** Per-base membership in Dam/Dcm/EcoKI motifs (bits 1/2/4). */
  motifBits: Uint8Array
  /** Prepared once so per-site context checks never duplicate the full sequence. */
  windowSequence: string
}

const methylationContextCache: MethylationContext[] = []
const contextPatternRegexCache = new Map<string, RegExp>()

function motifLength(motif: RegExp) {
  if (motif === DAM_MOTIF) return 4
  if (motif === DCM_MOTIF) return 5
  return 13
}

function markMotifBits(context: MethylationContext, motif: RegExp, bit: number) {
  const { normalized, topology, motifBits } = context
  const length = normalized.length
  if (!length) return
  const size = motifLength(motif)
  const searchable = topology === 'circular' ? normalized + normalized.slice(0, size - 1) : normalized
  const pattern = new RegExp(`(?=(${motif.source}))`, 'g')
  let match = pattern.exec(searchable)
  while (match) {
    const start = match.index
    if (start >= length) break
    if (topology === 'circular' || start + size <= length) {
      for (let offset = 0; offset < size; offset += 1) {
        motifBits[(start + offset) % length] |= bit
      }
    }
    pattern.lastIndex = match.index + 1
    match = pattern.exec(searchable)
  }
}

export function buildMethylationContext(
  sequence: string,
  topology: Topology = 'circular',
): MethylationContext {
  const normalized = normalizeDna(sequence)
  const cached = methylationContextCache.find(
    (candidate) => candidate.normalized === normalized && candidate.topology === topology,
  )
  if (cached) return cached

  const context: MethylationContext = {
    normalized,
    topology,
    motifBits: new Uint8Array(normalized.length),
    windowSequence: topology === 'circular' ? normalized + normalized + normalized : normalized,
  }
  markMotifBits(context, DAM_MOTIF, DAM_BIT)
  markMotifBits(context, DCM_MOTIF, DCM_BIT)
  markMotifBits(context, ECO_KI_MOTIF, ECO_KI_BIT)
  methylationContextCache.unshift(context)
  if (methylationContextCache.length > 4) methylationContextCache.pop()
  return context
}

function motifBit(motif: RegExp) {
  if (motif === DAM_MOTIF) return DAM_BIT
  if (motif === DCM_MOTIF) return DCM_BIT
  return ECO_KI_BIT
}

function siteOverlapsMotif(
  site: RestrictionSite,
  sequence: string,
  motif: RegExp,
  context?: MethylationContext,
) {
  const resolved = context ?? buildMethylationContext(sequence)
  const length = resolved.normalized.length
  if (!length) return false
  const span = Math.max(1, site.match.length)
  const bit = motifBit(motif)
  for (let offset = 0; offset < span; offset += 1) {
    const position = site.start + offset
    if (resolved.topology === 'linear' && position >= length) break
    if (resolved.motifBits[position % length] & bit) return true
  }
  return false
}

function extendedSiteWindow(
  sequence: string,
  site: RestrictionSite,
  flank = 8,
  context?: MethylationContext,
) {
  const resolved = context ?? buildMethylationContext(sequence)
  const normalized = resolved.normalized
  const length = normalized.length
  if (length === 0) return ''
  const span = Math.max(1, site.match.length)
  if (resolved.topology === 'linear') {
    return normalized.slice(Math.max(0, site.start - flank), Math.min(length, site.start + span + flank))
  }
  return resolved.windowSequence.slice(
    site.start + length - flank,
    site.start + length + span + flank,
  )
}

function siteMatchesContextPattern(
  site: RestrictionSite,
  sequence: string,
  pattern: string,
  context?: MethylationContext,
) {
  const window = extendedSiteWindow(sequence, site, pattern.length, context)
  let regex = contextPatternRegexCache.get(pattern)
  if (!regex) {
    regex = new RegExp(patternToRegex(pattern))
    contextPatternRegexCache.set(pattern, regex)
  }
  return regex.test(window)
}

function siteMatchesAnyContext(
  site: RestrictionSite,
  sequence: string,
  patterns: string[] | undefined,
  context?: MethylationContext,
) {
  if (!patterns?.length) return false
  return patterns.some((pattern) => siteMatchesContextPattern(site, sequence, pattern, context))
}

function methylaseActive(methylase: MethylaseId, host: HostMethylationStatus) {
  if (methylase === 'dam') return host.dam
  if (methylase === 'dcm') return host.dcm
  return host.ecoKI
}

function motifForMethylase(methylase: MethylaseId) {
  if (methylase === 'dam') return DAM_MOTIF
  if (methylase === 'dcm') return DCM_MOTIF
  return ECO_KI_MOTIF
}

function isBlockedByRule(
  rule: MethylaseRule,
  methylase: MethylaseId,
  site: RestrictionSite,
  sequence: string,
  host: HostMethylationStatus,
  context?: MethylationContext,
) {
  if (!methylaseActive(methylase, host)) return false
  if (rule.effect === 'blocked_context') {
    return siteMatchesAnyContext(site, sequence, rule.contextPatterns, context)
  }
  if (rule.effect === 'blocked_overlap') {
    return siteOverlapsMotif(site, sequence, motifForMethylase(methylase), context)
  }
  return false
}

function isRequiredAndAvailable(
  rule: MethylaseRule,
  methylase: MethylaseId,
  site: RestrictionSite,
  sequence: string,
  host: HostMethylationStatus,
  context?: MethylationContext,
) {
  if (!methylaseActive(methylase, host)) return false
  if (rule.effect === 'requires') {
    return siteOverlapsMotif(site, sequence, motifForMethylase(methylase), context)
  }
  if (rule.effect === 'requires_5mc') {
    return siteOverlapsMotif(site, sequence, DCM_MOTIF, context)
  }
  return false
}

export function shouldIncludeRestrictionSite(
  enzyme: RestrictionEnzyme,
  site: RestrictionSite,
  sequence: string,
  host: HostMethylationStatus,
  context?: MethylationContext,
) {
  const rules = methylationRulesForEnzyme(enzyme)
  if (rules.dcm.effect === 'requires_5mc') {
    return isRequiredAndAvailable(rules.dcm, 'dcm', site, sequence, host, context)
  }
  if (rules.dam.effect === 'requires') {
    return true
  }
  return true
}

export function resolveSiteMethylationFromRules(
  site: RestrictionSite,
  sequence: string,
  host: HostMethylationStatus,
  context?: MethylationContext,
): 'normal' | 'blocked' | 'methyl-required-available' | 'methyl-required-unavailable' {
  const rules = methylationRulesForEnzyme(site.enzyme)

  if (rules.dam.effect === 'requires') {
    return isRequiredAndAvailable(rules.dam, 'dam', site, sequence, host, context)
      ? 'methyl-required-available'
      : 'methyl-required-unavailable'
  }
  if (rules.dcm.effect === 'requires_5mc') {
    return isRequiredAndAvailable(rules.dcm, 'dcm', site, sequence, host, context)
      ? 'methyl-required-available'
      : 'methyl-required-unavailable'
  }

  if (isBlockedByRule(rules.dam, 'dam', site, sequence, host, context)) return 'blocked'
  if (isBlockedByRule(rules.dcm, 'dcm', site, sequence, host, context)) return 'blocked'
  if (isBlockedByRule(rules.ecoKI, 'ecoKI', site, sequence, host, context)) return 'blocked'

  return 'normal'
}

export function propagateMethylationRulesByRecognition(
  enzymes: Array<Pick<RestrictionEnzyme, 'name' | 'recognition'>>,
) {
  const canonicalByRecognition = new Map<string, EnzymeMethylationRules>()
  for (const enzyme of enzymes) {
    const rules = methylationRulesForEnzyme(enzyme)
    const hasCustom =
      rules.dam.effect !== 'none' ||
      rules.dcm.effect !== 'none' ||
      rules.ecoKI.effect !== 'none'
    if (!hasCustom) continue
    if (!canonicalByRecognition.has(enzyme.recognition)) {
      canonicalByRecognition.set(enzyme.recognition, rules)
    }
  }

  for (const enzyme of enzymes) {
    const existing = methylationRulesForEnzyme(enzyme)
    const hasCustom =
      existing.dam.effect !== 'none' ||
      existing.dcm.effect !== 'none' ||
      existing.ecoKI.effect !== 'none'
    if (hasCustom) continue
    const inherited = canonicalByRecognition.get(enzyme.recognition)
    if (inherited) enzymeRulesByName.set(enzyme.name, inherited)
  }
}

export function attachMethylationRulesToCatalog<T extends RestrictionEnzyme>(enzymes: T[]): Array<T & { methylationRules: EnzymeMethylationRules }> {
  propagateMethylationRulesByRecognition(enzymes)
  return enzymes.map((enzyme) => ({
    ...enzyme,
    methylationRules: methylationRulesForEnzyme(enzyme),
  }))
}

export { DEFAULT_RULES }
