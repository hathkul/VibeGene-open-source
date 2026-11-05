import { getBuiltInCommonFeatures, detectCommonFeatures, type CommonFeatureTemplate } from './commonFeatures'
import { dnaTerminalEndDetail, type DnaTerminalEndDetail } from './dnaEnds'
import type { CrisprOligoRecipeId } from './crisprOligoDesign'
import { enzymes as builtInEnzymes, findRestrictionSites } from './enzymes'
import { normalizeDna } from './sequence'
import type { RestrictionEnzyme, RestrictionSite, SequenceRecord, Strand } from './types'
import crisprReferences from '../data/crisprReferences.json'

export type CrisprConfidence = 'high' | 'medium' | 'low'

export type CrisprNucleaseFinding = {
  name: string
  family: 'SpCas9' | 'SaCas9' | 'Cas12a' | 'other'
  start: number
  end: number
  strand: Strand
  evidence: string[]
  confidence: CrisprConfidence
}

export type CrisprGuideScaffoldFinding = {
  name: string
  family: 'SpCas9' | 'SaCas9' | 'Cas12a' | 'other'
  start: number
  end: number
  strand: Strand
  evidence: string[]
  confidence: CrisprConfidence
}

export type CrisprNearbyRestrictionSite = {
  enzymeName: string
  start: number
  end: number
  cutTop: number
  cutBottom: number
  distanceToScaffold: number
  strand: Strand
  recognition: string
  overhangType: RestrictionEnzyme['overhang']['type']
  overhangLength: number
  /** Actual sequence for cuts within the molecule; null when it cannot be resolved. */
  overhangSequence: string | null
}

export type CrisprCassetteFinding = {
  start: number
  end: number
  strand: Strand
  promoterName?: string
  scaffoldName: string
  architecture: 'direct-spacer' | 'removable-stuffer' | 'single-junction' | 'pre-linearized'
  /** Named only for explicitly supported, literature-backed mixed-enzyme spacer cassettes. */
  cloningPair?: string
  nearbyTypeIisSites: CrisprNearbyRestrictionSite[]
  likelyGuideLength: number
  likelyGuideLengthRange?: { min: number; max: number }
  confidence: CrisprConfidence
  evidence: string[]
  terminalEnds?: {
    promoterSide: DnaTerminalEndDetail
    scaffoldSide: DnaTerminalEndDetail
  }
  oligoTemplate?: {
    recipe: 'GeneArt-style' | 'Guide-it sgRNA1-style' | 'Guide-it CCGG-style' | 'AAVpro Guide-it SaCas9-style'
    recipeId: CrisprOligoRecipeId
    sense: string
    antisense: string
    note: string
    matchBasis: 'snapgene-recorded' | 'geometry-matched'
  }
}

export type CrisprRecommendation = {
  title: string
  detail: string
  confidence: CrisprConfidence
}

export type CrisprDetectionResult = {
  nucleaseFindings: CrisprNucleaseFinding[]
  guideScaffoldFindings: CrisprGuideScaffoldFinding[]
  cassetteFindings: CrisprCassetteFinding[]
  recommendations: CrisprRecommendation[]
  summary: string
}

export type CrisprDetectionOptions = {
  /** Caller may pass the asynchronously loaded library. Defaults to cached built-ins. */
  commonFeatures?: CommonFeatureTemplate[]
  restrictionEnzymes?: RestrictionEnzyme[]
}

const TYPE_IIS_NAMES = new Set(['BbsI', 'BsmBI', 'Esp3I', 'BsaI', 'SapI', 'AarI'])
// These bounds describe cut geometry in transcriptional coordinates, not how
// close the recognition motif happens to be to the scaffold.
const MAX_NEAR_CUT_TO_SCAFFOLD = 20
const MIN_SPACER_SLOT_LENGTH = 8
const MAX_SPACER_SLOT_LENGTH = 40
const MAX_REMOVABLE_STUFFER_LENGTH = 2500
const MAX_STUFFER_TO_PROMOTER_GAP = 50
const MIN_LINEAR_BACKBONE_LENGTH = 2000
const MAX_TERMINAL_JUNCTION_DISTANCE = 12

type MixedSpacerRecipe = {
  name: string
  upstreamEnzymes: string[]
  downstreamEnzymes: string[]
  minCutSpan: number
  maxCutSpan: number
  maxScaffoldIntrusion: number
}

// These are spacer-insertion architectures, not arbitrary pairs found near a
// guide. Pairs used to transfer a complete sgRNA cassette (for example
// BamHI+NotI, BamHI+EcoRI, or BglII+BamHI) intentionally do not belong here.
const MIXED_SPACER_RECIPES: MixedSpacerRecipe[] = [
  {
    name: 'BamHI + BsmBI/Esp3I',
    upstreamEnzymes: ['BamHI'],
    downstreamEnzymes: ['BsmBI', 'Esp3I'],
    minCutSpan: 20,
    maxCutSpan: 90,
    maxScaffoldIntrusion: 12,
  },
  {
    name: 'BlpI + BstXI',
    // In the Weissman/Bassik U6-sgRNA family, BstXI is promoter-side and
    // BlpI is scaffold-side in transcriptional orientation.
    upstreamEnzymes: ['BstXI'],
    downstreamEnzymes: ['BlpI'],
    minCutSpan: 8,
    maxCutSpan: 90,
    maxScaffoldIntrusion: 24,
  },
  {
    name: 'BclI + SwaI',
    upstreamEnzymes: ['BclI'],
    downstreamEnzymes: ['SwaI'],
    minCutSpan: 20,
    maxCutSpan: 140,
    // pML104/pML107 place SwaI in the structural portion of the sgRNA; the
    // annealed insert restores that short scaffold segment.
    maxScaffoldIntrusion: 60,
  },
]

function familyForName(name: string): CrisprNucleaseFinding['family'] {
  const normalized = name.toLowerCase()
  if (/sa.?cas9|staphylococcus aureus/.test(normalized)) return 'SaCas9'
  if (/cas12a|cpf1/.test(normalized)) return 'Cas12a'
  if (/(?:st1|nm|cj|campylobacter|neisseria|streptococcus thermophilus).*cas9|cas13|cas12[b-f]/.test(normalized)) return 'other'
  if (/cas9|crispr\/cas9|g\s*rna scaffold/.test(normalized)) return 'SpCas9'
  return 'other'
}

function bundledScaffoldTemplates(): CommonFeatureTemplate[] {
  return crisprReferences.scaffolds.map((reference) => ({
    id: reference.id,
    fileName: `${reference.id}.dna`,
    name: reference.name,
    type: 'misc_RNA',
    color: '#6f91a8',
    sequence: reference.sequence,
    notes: `${reference.family} guide RNA scaffold. ${reference.notes}`,
    qualifiers: [{ name: 'source', value: reference.sources.join('; ') }],
    locations: [{ start: 0, end: reference.sequence.length, strand: 'forward' }],
  }))
}

function scaffoldReferenceId(scaffoldName: string): string | undefined {
  return crisprReferences.scaffolds.find((reference) => reference.name === scaffoldName)?.id
}

function labelFromTemplate(template: CommonFeatureTemplate): string {
  return `${template.name} ${template.notes ?? ''} ${template.qualifiers.map((item) => `${item.name} ${item.value}`).join(' ')}`
}

function isNucleaseTemplate(template: CommonFeatureTemplate): boolean {
  return /cas\s*-?\d|cpf1|crispr.*endonuclease|cas9n|dcas9/i.test(labelFromTemplate(template))
    && template.sequence.length >= 700
}

function isGuideTemplate(template: CommonFeatureTemplate): boolean {
  return /g\s*rna|sg\s*rna|guide\s*rna|crispr.*scaffold|cas12a.*repeat/i.test(labelFromTemplate(template))
    && template.sequence.length >= 30 && template.sequence.length <= 500
}

function annotationFindings(record: SequenceRecord): CrisprNucleaseFinding[] {
  const findings: CrisprNucleaseFinding[] = []
  for (const feature of record.features) {
    const label = `${feature.name} ${feature.notes ?? ''}`
    if (!/cas\s*-?\d|cpf1|crispr.*endonuclease|cas9n|dcas9/i.test(label)) continue
    const annotatedLength = feature.locations.reduce((total, location) => total + Math.max(0, location.end - location.start), 0)
    if (annotatedLength < 700) continue
    const family = familyForName(label)
    for (const location of feature.locations) {
      findings.push({
        name: feature.name,
        family,
        start: location.start,
        end: location.end,
        strand: location.strand,
        evidence: [`Existing annotation: ${feature.name}`],
        confidence: 'medium',
      })
    }
  }
  return findings
}

function overhangForSite(site: RestrictionSite, sequence: string, topology: SequenceRecord['topology']): string | null {
  const length = site.enzyme.overhang.length
  if (!length || length > 20) return length ? null : ''
  const sequenceLength = sequence.length
  const forwardDistance = site.cutBottom - site.cutTop
  const modulo = (value: number) => ((value % sequenceLength) + sequenceLength) % sequenceLength
  const start = topology === 'circular'
    ? modulo(modulo(forwardDistance) === length ? site.cutTop : site.cutBottom)
    : Math.min(site.cutTop, site.cutBottom)
  if (topology === 'circular') {
    if (modulo(forwardDistance) !== length && modulo(-forwardDistance) !== length) return null
  } else if (Math.abs(forwardDistance) !== length || start < 0 || start + length > sequenceLength) {
    return null
  }
  let result = ''
  for (let offset = 0; offset < length; offset += 1) {
    const position = topology === 'circular' ? (start + offset) % sequenceLength : start + offset
    result += sequence[position] ?? ''
  }
  return result.length === length ? result : null
}

function orientedCutDistance(position: number, scaffold: CrisprGuideScaffoldFinding, length: number, topology: SequenceRecord['topology']) {
  const anchor = scaffold.strand === 'forward' ? scaffold.start : scaffold.end
  const directed = scaffold.strand === 'forward' ? anchor - position : position - anchor
  if (topology !== 'circular') return directed
  // Keep nearby cuts on either side of the scaffold junction signed. Mapping
  // every value to [0, length) makes a cut 2 bp inside the scaffold look a
  // plasmid-length away and breaks origin-crossing staggered cuts.
  return ((directed + length / 2) % length + length) % length - length / 2
}

function orientedCutDistances(site: RestrictionSite, scaffold: CrisprGuideScaffoldFinding, length: number, topology: SequenceRecord['topology']) {
  return [
    orientedCutDistance(site.cutTop, scaffold, length, topology),
    orientedCutDistance(site.cutBottom, scaffold, length, topology),
  ].sort((a, b) => a - b)
}

function correspondingStrandCutSpans(
  upstream: RestrictionSite,
  downstream: RestrictionSite,
  scaffold: CrisprGuideScaffoldFinding,
  length: number,
  topology: SequenceRecord['topology'],
) {
  return [
    orientedCutDistance(upstream.cutTop, scaffold, length, topology)
      - orientedCutDistance(downstream.cutTop, scaffold, length, topology),
    orientedCutDistance(upstream.cutBottom, scaffold, length, topology)
      - orientedCutDistance(downstream.cutBottom, scaffold, length, topology),
  ]
}

function siteFinding(site: RestrictionSite, sequence: string, topology: SequenceRecord['topology'], distanceToScaffold: number): CrisprNearbyRestrictionSite {
  return {
    enzymeName: site.enzyme.name,
    start: site.start,
    end: site.end,
    cutTop: site.cutTop,
    cutBottom: site.cutBottom,
    distanceToScaffold: Math.round(distanceToScaffold),
    strand: site.match === site.enzyme.recognition ? 'forward' : 'reverse',
    recognition: site.match,
    overhangType: site.enzyme.overhang.type,
    overhangLength: site.enzyme.overhang.length,
    overhangSequence: overhangForSite(site, sequence, topology),
  }
}

function promoterToScaffoldGap(
  promoter: { start: number; end: number },
  scaffold: CrisprGuideScaffoldFinding,
  length: number,
  topology: SequenceRecord['topology'],
): number | null {
  if (length <= 0) return null
  const from = scaffold.strand === 'forward' ? promoter.end : promoter.start
  const to = scaffold.strand === 'forward' ? scaffold.start : scaffold.end
  const orientedGap = scaffold.strand === 'forward' ? to - from : from - to
  if (topology !== 'circular') return orientedGap >= 0 ? orientedGap : null
  return ((orientedGap % length) + length) % length
}

function detectScaffolds(record: SequenceRecord, templates: CommonFeatureTemplate[]): CrisprGuideScaffoldFinding[] {
  const findings: CrisprGuideScaffoldFinding[] = []
  const guideTemplates = templates.filter(isGuideTemplate)
  if (guideTemplates.length) {
    for (const match of detectCommonFeatures(record, guideTemplates, { minimumIdentityPercent: 95 })) {
      const family = familyForName(labelFromTemplate(match.template))
      findings.push({
        name: match.template.name,
        family,
        start: match.start,
        end: match.end,
        strand: match.strand,
        evidence: [`${match.template.name} sequence match (${match.matchPercent.toFixed(1)}% identity)`],
        confidence: match.matchPercent >= 99 ? 'high' : 'medium',
      })
    }
  }
  // An existing misc_RNA annotation can describe a scaffold not yet in the common library.
  for (const feature of record.features) {
    if (!/g\s*rna|sg\s*rna|guide\s*rna|scaffold|direct repeat/i.test(`${feature.name} ${feature.notes ?? ''}`)) continue
    const annotatedLength = feature.locations.reduce((total, location) => total + Math.max(0, location.end - location.start), 0)
    if (annotatedLength < 30 || annotatedLength > 500) continue
    for (const location of feature.locations) findings.push({
      name: feature.name,
      family: familyForName(`${feature.name} ${feature.notes ?? ''}`),
      start: location.start,
      end: location.end,
      strand: location.strand,
      evidence: [`Existing annotation: ${feature.name}`],
      confidence: 'medium',
    })
  }
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.start}:${finding.end}:${finding.strand}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.start - b.start)
}

function detectNucleases(record: SequenceRecord, templates: CommonFeatureTemplate[]): CrisprNucleaseFinding[] {
  const nucleaseTemplates = templates.filter(isNucleaseTemplate)
  const findings = annotationFindings(record)
  if (nucleaseTemplates.length) {
    for (const match of detectCommonFeatures(record, nucleaseTemplates, { minimumIdentityPercent: 88 })) {
      const label = labelFromTemplate(match.template)
      const family = familyForName(label)
      const overlapsNamedOrtholog = findings.some((finding) => {
        const overlap = Math.max(0, Math.min(finding.end, match.end) - Math.max(finding.start, match.start))
        return finding.family !== family && overlap / Math.max(1, Math.min(finding.end - finding.start, match.end - match.start)) >= 0.8
      })
      if (overlapsNamedOrtholog) continue
      findings.push({
        name: match.template.name,
        family,
        start: match.start,
        end: match.end,
        strand: match.strand,
        evidence: [`${match.template.name} coding-sequence match (${match.matchPercent.toFixed(1)}% identity)`, ...(match.template.notes ? [match.template.notes] : [])],
        confidence: match.matchPercent >= 97 ? 'high' : 'medium',
      })
    }
  }
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.start}:${finding.end}:${finding.strand}:${finding.family}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.start - b.start)
}

function promoterMatches(record: SequenceRecord, templates: CommonFeatureTemplate[]) {
  const matches = detectCommonFeatures(record, templates.filter((template) => /u6|u3|h1|snr52|7sk/i.test(`${template.name} ${template.notes ?? ''}`) && /promoter/i.test(`${template.name} ${template.notes ?? ''}`) && template.sequence.length >= 80), { minimumIdentityPercent: 92 })
    .map((match) => ({ name: match.template.name, start: match.start, end: match.end, strand: match.strand }))
  // SnapGene vectors commonly annotate their own U6 variant even when its
  // sequence does not match a built-in promoter reference.
  for (const feature of record.features) {
    const label = `${feature.name} ${feature.notes ?? ''}`
    if (!/promoter/i.test(`${feature.name} ${feature.type}`) || !/u6|u3|h1|snr52|7sk/i.test(label)) continue
    for (const location of feature.locations) matches.push({
      name: feature.name,
      start: location.start,
      end: location.end,
      strand: location.strand,
    })
  }
  const seen = new Set<string>()
  return matches.filter((match) => {
    const key = `${match.name}:${match.start}:${match.end}:${match.strand}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function preLinearizedCassette(
  record: SequenceRecord,
  scaffold: CrisprGuideScaffoldFinding,
  promoters: ReturnType<typeof promoterMatches>,
): CrisprCassetteFinding | null {
  const length = normalizeDna(record.sequence).length
  if (record.molecule !== 'dna' || record.topology !== 'linear' || length < MIN_LINEAR_BACKBONE_LENGTH) return null
  // The promoter and scaffold meet only after the two physical DNA ends are
  // joined with a guide insert. Their positions must be opposite in the
  // stored linear sequence, and in the right transcriptional orientation.
  const scaffoldTerminalDistance = scaffold.strand === 'forward' ? scaffold.start : length - scaffold.end
  if (scaffoldTerminalDistance < 0 || scaffoldTerminalDistance > MAX_TERMINAL_JUNCTION_DISTANCE) return null
  const promoter = promoters
    .filter((candidate) => candidate.strand === scaffold.strand && candidate.end - candidate.start >= 80)
    .map((candidate) => ({
      promoter: candidate,
      terminalDistance: scaffold.strand === 'forward' ? length - candidate.end : candidate.start,
    }))
    .filter((candidate) => candidate.terminalDistance >= 0 && candidate.terminalDistance <= MAX_TERMINAL_JUNCTION_DISTANCE)
    .sort((a, b) => a.terminalDistance - b.terminalDistance)[0]?.promoter
  if (!promoter) return null

  const promoterEnd = dnaTerminalEndDetail(record, scaffold.strand === 'forward' ? 'downstream' : 'upstream')
  const scaffoldEnd = dnaTerminalEndDetail(record, scaffold.strand === 'forward' ? 'upstream' : 'downstream')
  const guideStrand = scaffold.strand === 'forward' ? 'top' : 'bottom'
  const otherStrand = guideStrand === 'top' ? 'bottom' : 'top'
  const knownEnds = promoterEnd.provenance !== 'not-recorded' && scaffoldEnd.provenance !== 'not-recorded'
    && promoterEnd.modification !== null && scaffoldEnd.modification !== null
  const matchBasis = promoterEnd.provenance === 'snapgene-block8' && scaffoldEnd.provenance === 'snapgene-block8'
    ? 'snapgene-recorded' as const : 'geometry-matched' as const
  const sourceCaution = matchBasis === 'geometry-matched'
    ? ' The end geometry matches this recipe, but was not imported as explicit SnapGene end properties; verify the source protocol and end chemistry.'
    : ''
  const geneArtSignature = knownEnds && scaffold.family === 'SpCas9' &&
    promoterEnd.polarity === "3'" && promoterEnd.protrudingStrand === guideStrand && promoterEnd.bases5to3 === 'CACCG' &&
    scaffoldEnd.polarity === "3'" && scaffoldEnd.protrudingStrand === otherStrand && scaffoldEnd.bases5to3 === 'AAAAC'
  const guideItSgRna1Signature = knownEnds && scaffold.family === 'SpCas9' &&
    promoterEnd.polarity === "5'" && promoterEnd.protrudingStrand === otherStrand && promoterEnd.bases5to3 === 'GGTG' &&
    scaffoldEnd.polarity === "5'" && scaffoldEnd.protrudingStrand === guideStrand && scaffoldEnd.bases5to3 === 'GTTT'
  const guideItCcggSignature = knownEnds && scaffold.family === 'SpCas9' &&
    promoterEnd.polarity === "5'" && promoterEnd.protrudingStrand === otherStrand && promoterEnd.bases5to3 === 'CCGG' &&
    scaffoldEnd.polarity === "5'" && scaffoldEnd.protrudingStrand === guideStrand && scaffoldEnd.bases5to3 === 'GTTT'
  const aavproSaCas9Signature = knownEnds && scaffold.family === 'SaCas9' &&
    promoterEnd.polarity === "5'" && promoterEnd.protrudingStrand === otherStrand && promoterEnd.bases5to3 === 'CGGT' &&
    scaffoldEnd.polarity === "5'" && scaffoldEnd.protrudingStrand === guideStrand && scaffoldEnd.bases5to3 === 'GTTT'
  const oligoTemplate: CrisprCassetteFinding['oligoTemplate'] = geneArtSignature
    ? {
        recipe: 'GeneArt-style',
        recipeId: 'geneart',
        matchBasis,
        sense: "5′-[19–20 nt target]-GTTTT-3′",
        antisense: "5′-[reverse complement of target]-CGGTG-3′",
        note: `The promoter-side CACCG end supplies the leading U6 G. Confirm the chosen target length and vector protocol before ordering.${sourceCaution}`,
      }
    : guideItSgRna1Signature
      ? {
          recipe: 'Guide-it sgRNA1-style',
          recipeId: 'guide-it-sgrna1',
          matchBasis,
          sense: "5′-CACC-[20 nt spacer]-3′",
          antisense: "5′-AAAC-[reverse complement of spacer]-3′",
          note: `If the chosen guide does not begin with G, follow the vector protocol for an added transcriptional G/C; the PAM is not part of the oligos.${sourceCaution}`,
        }
      : guideItCcggSignature
        ? {
            recipe: 'Guide-it CCGG-style',
            recipeId: 'guide-it-ccgg',
            matchBasis,
            sense: "5′-CCGG-[20 nt spacer]-3′",
            antisense: "5′-AAAC-[reverse complement of spacer]-3′",
            note: `The promoter-side CCGG end supplies the U6 initiation G. Confirm the chosen target and vector protocol before ordering; omit the PAM.${sourceCaution}`,
          }
        : aavproSaCas9Signature
          ? {
              recipe: 'AAVpro Guide-it SaCas9-style',
              recipeId: 'aavpro-sacas9',
              matchBasis,
              sense: "5′-ACCG-[20–22 nt guide]-3′",
              antisense: "5′-AAAC-[reverse complement of guide]-3′",
              note: `The promoter-side end supplies the transcriptional G. Select a 20–22 nt SaCas9 guide and omit the PAM.${sourceCaution}`,
            }
          : undefined
  const evidence = [
    `Linear ${length.toLocaleString()} bp DNA backbone with ${promoter.name} and ${scaffold.name} at opposite physical termini in guide-transcription order`,
    `The open ends define the guide insertion junction; no internal restriction site is required for this already-linearized molecule`,
  ]
  if (promoterEnd.provenance !== 'not-recorded' && scaffoldEnd.provenance !== 'not-recorded') {
    const describe = (end: DnaTerminalEndDetail) => end.polarity === 'blunt'
      ? 'blunt'
      : `${end.length} nt ${end.polarity === "5'" ? '5′' : '3′'} overhang${end.bases5to3 ? ` (${end.bases5to3}, 5′→3′)` : ''}`
    evidence.push(`Recorded DNA ends: promoter side ${describe(promoterEnd)}; scaffold side ${describe(scaffoldEnd)}`)
  } else {
    evidence.push('End chemistry was not recorded; terminal overhangs and phosphorylation are unknown')
  }
  if (promoterEnd.enzymeName && scaffoldEnd.enzymeName) {
    const normalizeEnzyme = (name: string) => /^(?:BsmBI|Esp3I)$/i.test(name) ? 'BsmBI/Esp3I' : /^(?:BbsI|BpiI)$/i.test(name) ? 'BbsI/BpiI' : name
    evidence.push(`Recorded terminal enzymes: promoter side ${normalizeEnzyme(promoterEnd.enzymeName)}; scaffold side ${normalizeEnzyme(scaffoldEnd.enzymeName)}`)
  } else {
    evidence.push('Terminal enzyme identities are not recorded; verify the vector-specific overhang sequences and cloning protocol before designing oligos')
  }
  return {
    // The junction spans the two sequence termini, so there is no contiguous
    // promoter-to-scaffold interval to represent with start/end coordinates.
    start: 0,
    end: length,
    strand: scaffold.strand,
    promoterName: promoter.name,
    scaffoldName: scaffold.name,
    architecture: 'pre-linearized',
    nearbyTypeIisSites: [],
    likelyGuideLength: scaffold.family === 'SaCas9' ? 21 : scaffold.family === 'Cas12a' ? 23 : 20,
    ...(aavproSaCas9Signature ? { likelyGuideLengthRange: { min: 20, max: 22 } } : {}),
    confidence: scaffold.confidence === 'high' ? 'high' : 'medium',
    evidence,
    terminalEnds: { promoterSide: promoterEnd, scaffoldSide: scaffoldEnd },
    ...(oligoTemplate ? { oligoTemplate } : {}),
  }
}

function detectCassettes(
  record: SequenceRecord,
  templates: CommonFeatureTemplate[],
  scaffolds: CrisprGuideScaffoldFinding[],
  enzymePool: RestrictionEnzyme[],
): CrisprCassetteFinding[] {
  const sequence = normalizeDna(record.sequence)
  const topology = record.topology
  const promoters = promoterMatches(record, templates)
  const typeIis = enzymePool.filter((enzyme) => TYPE_IIS_NAMES.has(enzyme.name) || enzyme.type === 'IIS')
  const mixedRecipeNames = new Set(MIXED_SPACER_RECIPES.flatMap((recipe) => [...recipe.upstreamEnzymes, ...recipe.downstreamEnzymes]))
  const cassetteEnzymes = enzymePool.filter((enzyme) => typeIis.includes(enzyme) || mixedRecipeNames.has(enzyme.name))
  const sites = findRestrictionSites(sequence, cassetteEnzymes, { topology, annotateMethylation: false })
  const typeIisSites = sites.filter((site) => typeIis.includes(site.enzyme))
  const results: CrisprCassetteFinding[] = []
  for (const scaffold of scaffolds) {
    const linearCassette = preLinearizedCassette(record, scaffold, promoters)
    if (linearCassette) {
      results.push(linearCassette)
      continue
    }
    const nearbyPromoters = promoters
      .map((promoter) => ({ promoter, gap: promoter.strand === scaffold.strand ? promoterToScaffoldGap(promoter, scaffold, sequence.length, topology) : null }))
      .filter((candidate): candidate is { promoter: (typeof promoters)[number]; gap: number } => candidate.gap !== null && candidate.gap <= 2500)
      .sort((a, b) => a.gap - b.gap)
    const promoter = nearbyPromoters[0]?.promoter
    type ValidCassette = {
      sites: RestrictionSite[]
      kind: 'junction' | 'direct-spacer' | 'removable-stuffer'
      slotLength: number | null
      nearDistance: number
      uniqueKey: string
      mixedRecipe?: MixedSpacerRecipe
      cutSpanRange?: [number, number]
    }
    const validCassette: ValidCassette[] = typeIisSites.flatMap((site): ValidCassette[] => {
      const enzymeSites = typeIisSites.filter((candidate) => candidate.enzyme.name === site.enzyme.name)
      // Whole-plasmid count matters: a third cut would fragment the backbone.
      if (enzymeSites.length > 2 || enzymeSites.length === 0) return []
      const enzyme = site.enzyme
      const uniqueKey = `${enzyme.recognition}:${enzyme.cutTop}:${enzyme.cutBottom}:${enzyme.overhang.type}:${enzyme.overhang.length}`
      if (site !== enzymeSites[0]) return []
      if (enzymeSites.length === 1) {
        const distances = orientedCutDistances(site, scaffold, sequence.length, topology)
        // A unique Type IIS cut can create an insertion junction only when
        // both strand cuts lie just upstream of the scaffold's 5′ end.
        if (distances[0] < -6 || distances[1] > MAX_NEAR_CUT_TO_SCAFFOLD || enzyme.overhang.length < 2 || enzyme.overhang.length > 6) return []
        return [{ sites: enzymeSites, kind: 'junction' as const, slotLength: null, nearDistance: (distances[0] + distances[1]) / 2, uniqueKey }]
      }
      const ordered = enzymeSites.map((candidate) => ({ site: candidate, cuts: orientedCutDistances(candidate, scaffold, sequence.length, topology) }))
        .sort((a, b) => (b.cuts[0] + b.cuts[1]) - (a.cuts[0] + a.cuts[1]))
      const [outer, inner] = ordered
      if (!outer || !inner) return []
      // The two staggered cuts at each site must both lie before the scaffold;
      // the inner site must sit close to its 5′ edge, with a short bounded
      // replaceable interval between the two actual cleavage positions.
      const slotLength = outer.cuts[0] - inner.cuts[1]
      if (outer.cuts[0] <= inner.cuts[1]
        || inner.cuts[0] < -6
        || inner.cuts[1] > MAX_NEAR_CUT_TO_SCAFFOLD) return []
      if (slotLength >= MIN_SPACER_SLOT_LENGTH && slotLength <= MAX_SPACER_SLOT_LENGTH) {
        return [{ sites: [outer.site, inner.site], kind: 'direct-spacer' as const, slotLength, nearDistance: (inner.cuts[0] + inner.cuts[1]) / 2, uniqueKey }]
      }
      // Large stuffer plasmids (for example lentiCRISPRv2) have a guide-adjacent
      // Type IIS boundary and a distant partner site inside the same promoter→guide
      // transcription cassette. The promoter is the evidence that bounds this search.
      const promoterGap = promoter ? promoterToScaffoldGap(promoter, scaffold, sequence.length, topology) : null
      if (slotLength > MAX_SPACER_SLOT_LENGTH
        && slotLength <= MAX_REMOVABLE_STUFFER_LENGTH
        && promoterGap !== null
        && outer.cuts[0] <= promoterGap + MAX_NEAR_CUT_TO_SCAFFOLD
        && outer.cuts[0] >= promoterGap - MAX_STUFFER_TO_PROMOTER_GAP) {
        return [{ sites: [outer.site, inner.site], kind: 'removable-stuffer' as const, slotLength, nearDistance: (inner.cuts[0] + inner.cuts[1]) / 2, uniqueKey }]
      }
      return []
    })
    if (promoter) {
      const promoterGap = promoterToScaffoldGap(promoter, scaffold, sequence.length, topology)
      if (promoterGap !== null) {
        for (const recipe of MIXED_SPACER_RECIPES) {
          const upstreamSites = sites.filter((site) => recipe.upstreamEnzymes.includes(site.enzyme.name))
          const downstreamSites = sites.filter((site) => recipe.downstreamEnzymes.includes(site.enzyme.name))
          // Count physical cut sites by recognition coordinates so the BsmBI
          // and Esp3I aliases do not make one motif look like two sites.
          const physicalCount = (candidateSites: RestrictionSite[]) => new Set(candidateSites.map((site) => `${site.start}:${site.end}`)).size
          if (!upstreamSites.length || !downstreamSites.length
            || physicalCount(upstreamSites) > 2 || physicalCount(downstreamSites) > 2) continue
          let best: ValidCassette | null = null
          for (const upstreamSite of upstreamSites) {
            for (const downstreamSite of downstreamSites) {
              const upstreamCuts = orientedCutDistances(upstreamSite, scaffold, sequence.length, topology)
              const downstreamCuts = orientedCutDistances(downstreamSite, scaffold, sequence.length, topology)
              const strandSpans = correspondingStrandCutSpans(upstreamSite, downstreamSite, scaffold, sequence.length, topology)
              const cutSpanMin = Math.min(...strandSpans)
              const cutSpanMax = Math.max(...strandSpans)
              // The promoter and scaffold define the transcribed slot. The
              // downstream enzyme may cut a short distance into the scaffold
              // only for recipes whose cloning oligos restore those bases.
              if (upstreamCuts[0] <= downstreamCuts[1]
                || upstreamCuts[0] > promoterGap + MAX_NEAR_CUT_TO_SCAFFOLD
                || upstreamCuts[1] < 0
                || downstreamCuts[0] < -recipe.maxScaffoldIntrusion
                || downstreamCuts[1] > MAX_NEAR_CUT_TO_SCAFFOLD
                || cutSpanMin < recipe.minCutSpan
                || cutSpanMax > recipe.maxCutSpan) continue
              const candidate: ValidCassette = {
                sites: [upstreamSite, downstreamSite],
                kind: 'direct-spacer',
                slotLength: Math.round((cutSpanMin + cutSpanMax) / 2),
                nearDistance: (downstreamCuts[0] + downstreamCuts[1]) / 2,
                uniqueKey: `mixed:${recipe.name}`,
                mixedRecipe: recipe,
                cutSpanRange: [cutSpanMin, cutSpanMax],
              }
              if (!best || (candidate.slotLength ?? Number.MAX_SAFE_INTEGER) < (best.slotLength ?? Number.MAX_SAFE_INTEGER)) best = candidate
            }
          }
          if (best) validCassette.push(best)
        }
      }
    }
    const enzymePreference = ['BbsI', 'BsmBI', 'BsaI', 'SapI', 'AarI', 'BpiI', 'Esp3I', 'BspQI']
    const cassetteByEnzyme = new Map<string, ValidCassette>()
    for (const candidate of validCassette.sort((a, b) => {
      const aRank = enzymePreference.indexOf(a.sites[0]?.enzyme.name ?? '')
      const bRank = enzymePreference.indexOf(b.sites[0]?.enzyme.name ?? '')
      return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank)
    })) {
      if (!cassetteByEnzyme.has(candidate.uniqueKey)) cassetteByEnzyme.set(candidate.uniqueKey, candidate)
    }
    if (!cassetteByEnzyme.size) continue
    const architectureRank = { 'direct-spacer': 2, 'removable-stuffer': 1, junction: 0 } as const
    const chosen = [...cassetteByEnzyme.values()].sort((a, b) =>
      architectureRank[b.kind] - architectureRank[a.kind] || (a.slotLength ?? 0) - (b.slotLength ?? 0),
    )[0]!
    const nearbySites = chosen.sites.map((site) => {
      const cuts = orientedCutDistances(site, scaffold, sequence.length, topology)
      return siteFinding(site, sequence, topology, (cuts[0] + cuts[1]) / 2)
    }).sort((a, b) => a.distanceToScaffold - b.distanceToScaffold)
    const evidence = [`Detected ${scaffold.name} scaffold at ${scaffold.start + 1}–${scaffold.end}`]
    if (promoter) evidence.push(`${promoter.name} on the same strand within 2.5 kb`)
    if (chosen.mixedRecipe) {
      const [spanMin, spanMax] = chosen.cutSpanRange ?? [chosen.slotLength ?? 0, chosen.slotLength ?? 0]
      const spanLabel = spanMin === spanMax
        ? `${spanMin} nt cleavage span`
        : `${spanMin} and ${spanMax} nt cleavage spans on corresponding strands`
      evidence.push(`Known ${chosen.mixedRecipe.name} spacer-cloning architecture: unique/dual-cut sites bracket the promoter-to-scaffold variable region (${spanLabel})`)
    }
    else if (chosen.kind === 'direct-spacer') evidence.push(`${chosen.sites.length} unique/dual-cut sites bracket an approximately ${chosen.slotLength} bp spacer slot by their cleavage coordinates`)
    else if (chosen.kind === 'removable-stuffer') evidence.push(`${chosen.sites.length} unique/dual-cut sites bracket an approximately ${chosen.slotLength} bp removable stuffer within the promoter-to-scaffold cassette`)
    else evidence.push(`Single-cut insertion junction: unique ${chosen.sites[0]?.enzyme.name} site creates a ${chosen.sites[0]?.enzyme.overhang.length} bp overhang ${Math.round(chosen.nearDistance)} bp upstream of the scaffold; the second insert junction is not identified`)
    const referenceId = scaffoldReferenceId(scaffold.name)
    if (referenceId) {
      const referenceExamples = crisprReferences.emptyVectorPatterns.filter((reference) => {
        if (reference.scaffoldId !== referenceId || reference.enzyme !== chosen.sites[0]?.enzyme.name
          || reference.architecture !== (chosen.kind === 'junction' ? 'single-junction' : chosen.kind)
          || reference.totalEnzymeSites !== 2) return false
        const observedSpan = chosen.slotLength ?? 0
        const tolerance = chosen.kind === 'removable-stuffer' ? 20 : 8
        return Math.abs(reference.slotLength - observedSpan) <= tolerance
      }).map((reference) => reference.name)
      if (referenceExamples.length) {
        evidence.push(`Cassette geometry is also present in local SnapGene empty-vector examples: ${[...new Set(referenceExamples)].join(', ')}. This is a pattern comparison, not a plasmid identity match.`)
      }
    }
    results.push({
      start: promoter?.start ?? Math.max(0, scaffold.start - MAX_SPACER_SLOT_LENGTH - MAX_NEAR_CUT_TO_SCAFFOLD),
      end: scaffold.end,
      strand: scaffold.strand,
      promoterName: promoter?.name,
      scaffoldName: scaffold.name,
      architecture: chosen.kind === 'junction' ? 'single-junction' : chosen.kind,
      cloningPair: chosen.mixedRecipe?.name,
      nearbyTypeIisSites: nearbySites,
      likelyGuideLength: scaffold.family === 'SaCas9' ? 21 : scaffold.family === 'Cas12a' ? 23 : 20,
      confidence: chosen.kind === 'junction' ? 'low' : promoter ? 'high' : 'medium',
      evidence,
    })
  }
  return results.sort((a, b) => a.start - b.start)
}

function recommendations(nucleases: CrisprNucleaseFinding[], scaffolds: CrisprGuideScaffoldFinding[], cassettes: CrisprCassetteFinding[]): CrisprRecommendation[] {
  const recommendations: CrisprRecommendation[] = []
  const families = new Set([...nucleases.map((item) => item.family), ...scaffolds.map((item) => item.family)])
  if (families.has('SpCas9')) recommendations.push({
    title: 'SpCas9 guide design',
    detail: 'Use a 20 nt spacer immediately 5′ of an NGG PAM (PAM is not part of the guide). SpCas9 typically cuts about 3 bp upstream of the PAM.',
    confidence: 'high',
  })
  if (families.has('SaCas9')) recommendations.push({
    title: 'SaCas9 guide design',
    detail: 'SaCas9 commonly uses a 21 nt spacer next to an NNGRRT PAM. Confirm the exact SaCas9 variant and guide format for this construct.',
    confidence: 'medium',
  })
  if (families.has('Cas12a')) recommendations.push({
    title: 'Cas12a guide design',
    detail: 'Cas12a commonly uses a 23 nt guide with a 5′ TTTV PAM. Guide length and PAM acceptance vary by ortholog and engineered variant.',
    confidence: 'medium',
  })
  if (!families.size) recommendations.push({
    title: 'Nuclease not identified',
    detail: 'No supported Cas nuclease or guide scaffold was confidently recognized. Add or select a reference feature before using nuclease-specific guide rules.',
    confidence: 'low',
  })
  for (const cassette of cassettes.filter((item) => item.cloningPair)) {
    const scaffold = scaffolds.find((item) => item.name === cassette.scaffoldName && item.strand === cassette.strand)
    const design = scaffold?.family === 'Cas12a'
      ? 'a typical 23 nt guide next to a 5′ TTTV PAM'
      : scaffold?.family === 'SaCas9'
        ? 'a typical 21 nt spacer next to an NNGRRT PAM'
        : scaffold?.family === 'SpCas9'
          ? 'a 20 nt spacer immediately 5′ of an NGG PAM'
          : `the construct-specific ${cassette.likelyGuideLength} nt spacer`
    const protocolCaution = cassette.cloningPair === 'BclI + SwaI'
      ? ' BclI is blocked by Dam methylation, so this workflow normally requires plasmid DNA prepared from a dam− host.'
      : ''
    recommendations.push({
      title: `${cassette.cloningPair} spacer cloning`,
      detail: `This recognized vector architecture uses ${cassette.cloningPair} to replace the guide region. Design ${design}; do not include the PAM in the cloned spacer. Derive the exact junction-compatible oligos from this vector's sequence and protocol, because the insert may need to restore bases removed from the scaffold.${protocolCaution}`,
      confidence: cassette.confidence,
    })
  }
  for (const cassette of cassettes.filter((item) => item.architecture === 'pre-linearized')) {
    const enzymesRecorded = Boolean(cassette.terminalEnds?.promoterSide.enzymeName && cassette.terminalEnds.scaffoldSide.enzymeName)
    const template = cassette.oligoTemplate
    const ends = cassette.terminalEnds
    const templateGuidance = template
      ? ` Matched ${template.recipe} terminal signature. Sense oligo template: ${template.sense}; antisense oligo template: ${template.antisense}. ${template.note}`
      : ends?.promoterSide.provenance === 'not-recorded' || ends?.scaffoldSide.provenance === 'not-recorded'
        ? ' Terminal chemistry and overhang sequences are not recorded. Check the source vector and cloning protocol before designing oligos.'
        : ' No validated oligo formula matches these ends; use the displayed end chemistry and the vector-specific protocol to determine the insert junctions.'
    recommendations.push({
      title: 'Pre-linearized sgRNA backbone',
      detail: `The guide insert joins the existing DNA ends between ${cassette.promoterName} and ${cassette.scaffoldName}. Design a ${cassette.likelyGuideLengthRange ? `${cassette.likelyGuideLengthRange.min}–${cassette.likelyGuideLengthRange.max}` : cassette.likelyGuideLength} nt guide appropriate for the scaffold family; the PAM stays in the target DNA, not the guide.${templateGuidance}${enzymesRecorded ? ' Recorded terminal enzyme names are shown above; verify them against the vector protocol.' : ' The terminal enzyme identities cannot be inferred from this sequence alone.'}`,
      confidence: cassette.confidence,
    })
  }
  if (cassettes.some((cassette) => cassette.nearbyTypeIisSites.length)) {
    const hasPairedSlot = cassettes.some((cassette) => cassette.architecture === 'direct-spacer')
    const hasRemovableStuffer = cassettes.some((cassette) => cassette.architecture === 'removable-stuffer')
    const hasSingleJunction = cassettes.some((cassette) => cassette.evidence.some((item) => item.includes('Single-cut insertion junction')))
    const hasMixedPair = cassettes.some((cassette) => cassette.cloningPair)
    const detail = hasRemovableStuffer
      ? 'Paired Type IIS cuts may remove a long stuffer between the promoter and guide scaffold. Verify that both sites bound only the intended cassette and confirm the resulting overhangs and insertion orientation.'
      : hasPairedSlot && hasSingleJunction
        ? 'Paired cuts bracket a candidate spacer slot; verify their overhangs and insertion orientation. A single-cut insertion junction is a separate, lower-confidence candidate and needs a defined second insert junction.'
        : hasMixedPair
          ? 'A recognized mixed-enzyme pair brackets the guide insertion region. Verify both junction sequences, insertion orientation, and complete-plasmid site counts before ordering oligos.'
        : hasPairedSlot
          ? 'Paired Type IIS cuts bracket a candidate spacer slot. Verify their resulting overhangs, insertion orientation, and complete-plasmid site count before ordering oligos.'
          : 'A unique Type IIS cut lies near the scaffold 5′ end and may provide one insertion junction. The detector did not identify the insert’s second junction, so confirm the cloning strategy before ordering oligos.'
    recommendations.push({
      title: 'Check the cloning sites',
      detail,
      confidence: hasPairedSlot || hasRemovableStuffer ? 'medium' : 'low',
    })
  }
  if (!scaffolds.length) recommendations.push({
    title: 'Guide scaffold not detected',
    detail: 'The detector could not identify a guide scaffold sequence. A U6 promoter or Type IIS site alone does not establish a functional sgRNA cassette.',
    confidence: 'low',
  })
  return recommendations
}

/** Scans annotations and the common-feature library for nuclease, scaffold, and guide-cassette evidence. */
export function detectCrispr(record: SequenceRecord, options: CrisprDetectionOptions = {}): CrisprDetectionResult {
  const providedTemplates = options.commonFeatures ?? getBuiltInCommonFeatures()
  const knownSequences = new Set(providedTemplates.map((template) => normalizeDna(template.sequence)))
  const templates = [...providedTemplates, ...bundledScaffoldTemplates().filter((template) => !knownSequences.has(normalizeDna(template.sequence)))]
  const nucleaseFindings = detectNucleases(record, templates)
  const guideScaffoldFindings = detectScaffolds(record, templates)
  const enzymePool = options.restrictionEnzymes ?? builtInEnzymes
  const cassetteFindings = detectCassettes(record, templates, guideScaffoldFindings, enzymePool)
  const recs = recommendations(nucleaseFindings, guideScaffoldFindings, cassetteFindings)
  const summary = [
    `${nucleaseFindings.length} nuclease finding${nucleaseFindings.length === 1 ? '' : 's'}`,
    `${guideScaffoldFindings.length} guide scaffold${guideScaffoldFindings.length === 1 ? '' : 's'}`,
    `${cassetteFindings.length} plausible guide cassette${cassetteFindings.length === 1 ? '' : 's'}`,
  ].join(' · ')
  return { nucleaseFindings, guideScaffoldFindings, cassetteFindings, recommendations: recs, summary }
}
