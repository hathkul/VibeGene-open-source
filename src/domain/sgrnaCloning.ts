import { detectCrispr, type CrisprCassetteFinding, type CrisprConfidence, type CrisprDetectionResult } from './crisprDetection'
import { designPreLinearizedOligos } from './crisprOligoDesign'
import { dnaTerminalEndDetail } from './dnaEnds'
import { enzymes, findRestrictionSites } from './enzymes'
import { flipRecord } from './flipRecord'
import { exportPrimerDataTsv } from './primerExport'
import {
  assembleRestrictionCloningProduct,
  defaultCloningPartConfig,
  isSameDnaBreak,
  listDigestFragmentsBetweenCuts,
  resolveCloningPart,
  type ResolvedCloningPart,
} from './restrictionCloning'
import { createId, normalizeDna, nowIso, reverseComplement } from './sequence'
import { sgRnaOligoDescription } from './sgrnaOligoPrimers'
import type { SgRNAAnnotation } from './sgrna'
import { serializeFeatureQualifiers } from './featureQualifiers'
import type { HistorySgRnaCloning, Primer, RestrictionSite, SequenceFeature, SequenceRecord } from './types'

export type SgRnaCloningChoice = {
  id: string
  kind: 'detected' | 'manual-sites' | 'existing-ends'
  label: string
  architecture: CrisprCassetteFinding['architecture'] | 'manual'
  confidence?: CrisprConfidence
  cassette?: CrisprCassetteFinding
  /** Physical sites in transcription order. Both are required for manual digestion. */
  promoterSite?: RestrictionSite
  scaffoldSite?: RestrictionSite
}

export type SgRnaCompatibility = {
  status: 'compatible' | 'warning' | 'incompatible'
  message: string
}

export type SgRnaCloneOligos = {
  /** Both strands are written 5′→3′, without the genomic PAM. */
  sense: string
  antisense: string
  expressedGuide: string
  senseModification: '5′ phosphate'
  antisenseModification: '5′ phosphate'
  note: string
}

export type SgRnaCloningItem = {
  guide: SgRNAAnnotation
  compatibility: SgRnaCompatibility
  oligos?: SgRnaCloneOligos
  /** Linear duplex of the annealed oligos, with the guide feature and sticky ends. */
  insert?: SequenceRecord
  product?: SequenceRecord
  issues: string[]
}

export type SgRnaCloningPlan = {
  detection: CrisprDetectionResult
  choices: SgRnaCloningChoice[]
  selectedChoice: SgRnaCloningChoice | null
  items: SgRnaCloningItem[]
  products: SequenceRecord[]
  primers: Primer[]
  primerListTsv: string
  issues: string[]
}

export type SgRnaCloningInput = {
  vector: SequenceRecord
  guides: readonly SgRNAAnnotation[]
  choice?: SgRnaCloningChoice | string
}

type PreparedVector = {
  record: SequenceRecord
  part: ResolvedCloningPart
  scaffold: string
  scaffoldName: string
  family: string
  promoterName: string
  /** Bases removed from the scaffold's 5′ end by the chosen digest. */
  scaffoldRestoration: string
  recipeId?: NonNullable<CrisprCassetteFinding['oligoTemplate']>['recipeId']
  cloningPair?: string
  /** Both selectors name one physical cut, so the vector is opened there and the guide is ligated in. */
  singleCut: boolean
  flipped: boolean
}

function choiceId(cassette: CrisprCassetteFinding, index: number) {
  return `detected:${index}:${cassette.architecture}:${cassette.strand}:${cassette.start}:${cassette.end}`
}

function choicesFromDetection(detection: CrisprDetectionResult): SgRnaCloningChoice[] {
  return detection.cassetteFindings.map((cassette, index) => ({
    id: choiceId(cassette, index),
    kind: 'detected',
    label: cassette.architecture === 'pre-linearized'
      ? `Existing sticky ends · ${cassette.scaffoldName}`
      : `${cassette.cloningPair ?? cassette.nearbyTypeIisSites.map((site) => site.enzymeName).join(' + ')} · ${cassette.architecture}`,
    architecture: cassette.architecture,
    confidence: cassette.confidence,
    cassette,
  }))
}

export function listSgRnaCloningChoices(vector: SequenceRecord): SgRnaCloningChoice[] {
  return choicesFromDetection(detectCrispr(vector))
}

function familyForGuide(guide: SgRNAAnnotation): string | null {
  const label = guide.nuclease.toLowerCase()
  if (/sa.?cas9|staphylococcus aureus/.test(label)) return 'SaCas9'
  if (/cas12a|cpf1/.test(label)) return 'Cas12a'
  if (/sp.?cas9|streptococcus pyogenes/.test(label)) return 'SpCas9'
  if (/cas9/.test(label)) return 'other'
  return null
}

function compatibilityForGuide(guide: SgRNAAnnotation, detection: CrisprDetectionResult, cassette?: CrisprCassetteFinding): SgRnaCompatibility {
  const guideFamily = familyForGuide(guide)
  const scaffold = cassette
    ? detection.guideScaffoldFindings.find((item) => item.name === cassette.scaffoldName && item.strand === cassette.strand)
    : detection.guideScaffoldFindings[0]
  const scaffoldFamily = scaffold?.family === 'other' ? null : scaffold?.family
  const casFamilies = [...new Set(detection.nucleaseFindings.map((item) => item.family).filter((family) => family !== 'other'))]
  const vectorFamily = scaffoldFamily ?? (casFamilies.length === 1 ? casFamilies[0] : null)
  if (guideFamily && vectorFamily && guideFamily !== vectorFamily) return {
    status: 'incompatible',
    message: `${guide.nuclease} guide is intended for ${guideFamily}, while the vector's guide scaffold is ${vectorFamily}. Verify the nuclease, scaffold and PAM before use.`,
  }
  if (scaffoldFamily && casFamilies.length && !casFamilies.includes(scaffoldFamily)) return {
    status: 'warning',
    message: `The vector's Cas annotation and guide scaffold disagree (${casFamilies.join(', ')} versus ${scaffoldFamily}). Verify the construct.`,
  }
  if (!guideFamily || !vectorFamily || guideFamily === 'other') return {
    status: 'warning',
    message: 'The guide or vector nuclease family is not specific enough to confirm compatibility. Check the scaffold and PAM.',
  }
  return { status: 'compatible', message: `${guideFamily} guide and vector scaffold agree.` }
}

function concrete(sequence: string | null | undefined): sequence is string {
  return Boolean(sequence && /^[ACGT]+$/.test(sequence))
}

function exactSite(record: SequenceRecord, site: RestrictionSite): RestrictionSite | null {
  const pool = enzymes.filter((enzyme) => enzyme.name === site.enzyme.name)
  return findRestrictionSites(record.sequence, pool, { topology: record.topology, annotateMethylation: false })
    .find((candidate) => candidate.start === site.start && candidate.cutTop === site.cutTop && candidate.cutBottom === site.cutBottom) ?? null
}

function siteFromFinding(record: SequenceRecord, finding: CrisprCassetteFinding['nearbyTypeIisSites'][number]): RestrictionSite | null {
  const pool = enzymes.filter((enzyme) => enzyme.name === finding.enzymeName)
  return findRestrictionSites(record.sequence, pool, { topology: record.topology, annotateMethylation: false })
    .find((candidate) => candidate.start === finding.start && candidate.cutTop === finding.cutTop && candidate.cutBottom === finding.cutBottom) ?? null
}

function flippedSite(original: RestrictionSite, record: SequenceRecord): RestrictionSite | null {
  const length = record.sequence.length
  const start = ((length - original.end) % length + length) % length
  const pool = enzymes.filter((enzyme) => enzyme.name === original.enzyme.name)
  return findRestrictionSites(record.sequence, pool, { topology: record.topology, annotateMethylation: false })
    .find((site) => site.start === start) ?? null
}

function matchedOrientedCassette(original: CrisprCassetteFinding, detection: CrisprDetectionResult, scaffoldEnd: number): CrisprCassetteFinding | null {
  // Scaffold name, architecture and enzyme pair are stable through reverse-complement.
  return detection.cassetteFindings
    .filter((candidate) => candidate.scaffoldName === original.scaffoldName
      && candidate.architecture === original.architecture && candidate.cloningPair === original.cloningPair
      && (candidate.architecture === 'pre-linearized' || candidate.end === scaffoldEnd))[0] ?? null
}

function preparedVector(input: SgRnaCloningInput, selected: SgRnaCloningChoice, detection: CrisprDetectionResult): PreparedVector {
  const originalCassette = selected.cassette
  const originalScaffold = originalCassette
    ? detection.guideScaffoldFindings.find((item) => item.name === originalCassette.scaffoldName && item.strand === originalCassette.strand)
    : detection.guideScaffoldFindings[0]
  if (!originalScaffold) throw new Error('A guide scaffold must be recognized before cloning.')
  if (originalScaffold.family === 'Cas12a') throw new Error('Cas12a crRNA cassettes require repeat-before-spacer planning, which this cloning workflow cannot yet validate.')
  const flipped = originalScaffold.strand === 'reverse'
  const record = flipped ? flipRecord(input.vector) : input.vector
  const orientedDetection = flipped ? detectCrispr(record) : detection
  const expectedScaffoldStart = flipped ? record.sequence.length - originalScaffold.end : originalScaffold.start
  const scaffold = orientedDetection.guideScaffoldFindings.find((item) => item.name === originalScaffold.name
    && item.strand === 'forward' && item.start === expectedScaffoldStart)
  if (!scaffold) throw new Error('The guide scaffold could not be located after orienting the vector.')
  const scaffoldSequence = normalizeDna(record.sequence.slice(scaffold.start, scaffold.end))
  if (!concrete(scaffoldSequence)) throw new Error('The guide scaffold contains ambiguous bases.')

  let cassette = originalCassette
  if (flipped && originalCassette) cassette = matchedOrientedCassette(originalCassette, orientedDetection, scaffold.end) ?? undefined
  if (selected.kind === 'detected' && !cassette) throw new Error('The detected cloning cassette could not be located in the vector.')
  if (cassette?.architecture === 'single-junction') throw new Error('A single restriction cut does not define both sgRNA insert junctions.')

  if (selected.kind === 'existing-ends' || cassette?.architecture === 'pre-linearized') {
    if (record.topology !== 'linear') throw new Error('Existing-end cloning requires a linear vector.')
    const promoterEnd = dnaTerminalEndDetail(record, 'downstream')
    const scaffoldEnd = dnaTerminalEndDetail(record, 'upstream')
    if (promoterEnd.provenance === 'not-recorded' || scaffoldEnd.provenance === 'not-recorded') {
      throw new Error('Terminal end chemistry was not recorded; verify the ends before generating oligos.')
    }
  if (!promoterEnd.length || !scaffoldEnd.length || !concrete(promoterEnd.bases5to3) || !concrete(scaffoldEnd.bases5to3)) {
      throw new Error('Both vector ends need exact sticky overhang bases for automatic oligo design.')
    }
    const recipeId = cassette?.oligoTemplate?.recipeId
      ?? orientedDetection.cassetteFindings.find((item) => item.architecture === 'pre-linearized' && item.scaffoldName === scaffold.name)?.oligoTemplate?.recipeId
    if (!recipeId) throw new Error('The recorded sticky ends do not match a validated sgRNA oligo recipe.')
    const config = defaultCloningPartConfig('vector', record)
    const part = resolveCloningPart(config, '#64748b')
    if (!part) throw new Error('The linear vector ends could not be prepared for assembly.')
    return {
      record, part, scaffold: scaffoldSequence, scaffoldName: scaffold.name, family: scaffold.family,
      promoterName: cassette?.promoterName ?? 'U6 promoter', scaffoldRestoration: '', recipeId, singleCut: false, flipped,
    }
  }

  if (record.topology !== 'circular') throw new Error('Paired-site sgRNA cloning currently requires a circular vector.')
  let promoterSite: RestrictionSite | null = null
  let scaffoldSite: RestrictionSite | null = null
  if (selected.kind === 'manual-sites') {
    if (!selected.promoterSite || !selected.scaffoldSite) throw new Error('Select both the promoter-side and scaffold-side restriction cuts.')
    promoterSite = flipped ? flippedSite(selected.promoterSite, record) : exactSite(record, selected.promoterSite)
    scaffoldSite = flipped ? flippedSite(selected.scaffoldSite, record) : exactSite(record, selected.scaffoldSite)
  } else if (cassette && cassette.nearbyTypeIisSites.length === 2) {
    const mapped = cassette.nearbyTypeIisSites.map((site) => siteFromFinding(record, site))
    if (mapped.some((site) => !site)) throw new Error('The detected restriction cuts could not be located again in this vector.')
    const ordered = mapped as RestrictionSite[]
    // In forward guide-transcription orientation the scaffold-side cut is nearest the scaffold.
    const distance = (site: RestrictionSite) => {
      const cut = Math.min(site.cutTop, site.cutBottom)
      return Math.min(Math.abs(cut - scaffold.start), Math.abs(site.start - scaffold.start))
    }
    ordered.sort((a, b) => distance(a) - distance(b))
    scaffoldSite = ordered[0]!
    promoterSite = ordered[1]!
  }
  if (!promoterSite || !scaffoldSite) throw new Error('Two validated restriction cuts are required for sgRNA cloning.')
  const singleCut = isSameDnaBreak(promoterSite, scaffoldSite)
  if (singleCut) scaffoldSite = promoterSite
  const promoterCut = Math.min(promoterSite.cutTop, promoterSite.cutBottom)
  const promoterFeatures = record.features.filter((feature) =>
    feature.type === 'promoter' || /(?:u6|h1).*promoter/i.test(feature.name))
  const nearbyPromoter = promoterFeatures.find((feature) => feature.locations.some((location) =>
    location.strand === 'forward' && Math.abs(location.end - promoterCut) <= 50))
  if (promoterFeatures.length && !nearbyPromoter) {
    throw new Error('The promoter-side cut is not adjacent to an annotated guide promoter.')
  }
  if (selected.kind === 'manual-sites' && !nearbyPromoter) {
    throw new Error('Manual cloning-site selection requires an annotated guide promoter near the upstream cut.')
  }
  if (!nearbyPromoter && !cassette?.promoterName) {
    throw new Error('A guide promoter must be identified beside the upstream cut before oligos can be designed.')
  }
  const selectedEnzymes = [...new Set([promoterSite.enzyme.name, scaffoldSite.enzyme.name])]
  for (const enzymeName of selectedEnzymes) {
    const enzyme = enzymes.find((entry) => entry.name === enzymeName)!
    const count = new Set(findRestrictionSites(record.sequence, [enzyme], { topology: record.topology, annotateMethylation: false })
      .map((site) => `${site.start}:${site.end}`)).size
    if (singleCut && count !== 1) {
      throw new Error(`${enzymeName} cuts the vector ${count} times. Choose each of those cuts separately, one after the guide promoter and one before the scaffold.`)
    }
    if (count > 2) throw new Error(`${enzymeName} cuts the vector ${count} times; this cannot yield the selected backbone alone.`)
  }
  const fragments = listDigestFragmentsBetweenCuts(record, promoterSite, scaffoldSite)
  const retained = fragments.find((fragment) => fragment.id === (singleCut ? 'linearized' : 'reverse'))
  if (!retained) throw new Error('The paired cuts do not leave a continuous circular backbone.')
  const config = defaultCloningPartConfig('vector', record)
  config.leftCut = { ...config.leftCut, enzymeName: promoterSite.enzyme.name, site: promoterSite }
  config.rightCut = { ...config.rightCut, enzymeName: scaffoldSite.enzyme.name, site: scaffoldSite }
  config.selectedFragmentId = retained.id
  const part = resolveCloningPart(config, '#64748b')
  if (!part || part.fragment.id !== retained.id) throw new Error('The selected vector fragment could not be prepared.')
  if (nearbyPromoter && !part.features.some((feature) => feature.name === nearbyPromoter.name
    && feature.locations.some((location) => location.end - location.start >= 80))) {
    throw new Error('The selected digest removes the guide promoter from the retained backbone.')
  }
  const scaffoldCut = Math.min(scaffoldSite.cutTop, scaffoldSite.cutBottom)
  const rawRestoration = scaffoldCut - scaffold.start
  // A cut upstream of the scaffold leaves that flank on the backbone; only a bite into the scaffold is restored by the oligo.
  const restorationLength = singleCut && rawRestoration < 0 ? 0 : rawRestoration
  if (singleCut && nearbyPromoter) {
    const promoterEnd = nearbyPromoter.locations.find((location) => location.strand === 'forward')?.end
    const opensGuideSlot = promoterEnd != null && scaffoldCut >= promoterEnd - 5 && scaffoldCut <= scaffold.start + 60
    if (!opensGuideSlot) {
      throw new Error(`Linearizing at ${promoterSite.enzyme.name} does not open the junction between the guide promoter and the scaffold.`)
    }
  }
  if (restorationLength < 0 || restorationLength > 60) throw new Error('The scaffold-side cut leaves an unvalidated guide-to-scaffold junction.')
  const scaffoldRestoration = scaffoldSequence.slice(0, restorationLength)
  const validEnd = (end: ResolvedCloningPart['upstreamOverhang']) => Boolean(end && (
    (end.type === 'blunt' && end.length === 0)
    || (end.type !== 'blunt' && end.length >= 2 && concrete(end.sequence) && end.sequence.length === end.length)
  ))
  if (!validEnd(part.upstreamOverhang) || !validEnd(part.downstreamOverhang)
    || (part.upstreamOverhang?.type === 'blunt' && part.downstreamOverhang?.type === 'blunt')) {
    throw new Error('The selected cuts need known, directional ligation ends; an unknown or two-blunt-end junction cannot be designed automatically.')
  }
  const promoterName = cassette?.promoterName
    ?? record.features.find((feature) => /(?:u6|h1).*promoter/i.test(feature.name))?.name
    ?? 'Guide promoter'
  return {
    record, part: singleCut ? copySingleCutOverhangDownstream(part) : part,
    scaffold: scaffoldSequence, scaffoldName: scaffold.name, family: scaffold.family,
    promoterName, scaffoldRestoration, cloningPair: cassette?.cloningPair, singleCut, flipped,
  }
}

/**
 * A single circular cut stores its overhang only at the upstream end of the
 * rotated plasmid. Sticky ligation needs that same top-strand overhang at the
 * downstream end so the oligo can carry it and the backbone copy is trimmed.
 */
function copySingleCutOverhangDownstream(part: ResolvedCloningPart): ResolvedCloningPart {
  const overhang = part.upstreamOverhang
  const bases = overhang?.sequence?.toUpperCase() ?? ''
  const length = overhang?.length ?? 0
  if (!overhang || overhang.type === 'blunt' || length < 1 || bases.length !== length) return part
  if (part.sequence.slice(-length).toUpperCase() === bases) return part
  const sequence = `${part.sequence}${bases}`
  return { ...part, sequence, length: sequence.length }
}

function topStrandOligos(topSequence: string, upstreamStickiness: number, downstreamStickiness: number) {
  const upstreamLength = Math.abs(upstreamStickiness)
  const downstreamLength = Math.abs(downstreamStickiness)
  const sense = topSequence.slice(upstreamStickiness < 0 ? upstreamLength : 0,
    downstreamStickiness > 0 ? topSequence.length - downstreamLength : topSequence.length)
  const antisenseTemplate = topSequence.slice(upstreamStickiness > 0 ? upstreamLength : 0,
    downstreamStickiness < 0 ? topSequence.length - downstreamLength : topSequence.length)
  return { sense, antisense: reverseComplement(antisenseTemplate) }
}

function productName(vector: SequenceRecord, guide: SgRNAAnnotation) {
  const stem = vector.name.replace(/\.dna$/i, '').trim() || 'sgRNA vector'
  return `${stem} - ${guide.guide.name}`
}

function circularLocations(start: number, length: number, total: number): SequenceFeature['locations'] {
  const end = start + length
  if (end <= total) return [{ start, end, strand: 'forward' }]
  return [
    { start, end: total, strand: 'forward' },
    { start: 0, end: end - total, strand: 'forward' },
  ]
}

function makeInsert(prepared: PreparedVector, guide: SgRNAAnnotation): { record: SequenceRecord; oligos: SgRnaCloneOligos } {
  const target = normalizeDna(guide.spacer)
  if (!concrete(target)) throw new Error('The selected sgRNA spacer must contain only A, C, G, and T.')
  const upstream = prepared.part.dnaEnds.upstream.stickiness
  const downstream = prepared.part.dnaEnds.downstream.stickiness
  const promoterLip = downstream ? prepared.part.sequence.slice(-Math.abs(downstream)).toUpperCase() : ''
  const scaffoldLip = upstream ? prepared.part.sequence.slice(0, Math.abs(upstream)).toUpperCase() : ''
  if ((downstream && !concrete(promoterLip)) || (upstream && !concrete(scaffoldLip)) || (!downstream && !upstream)) {
    throw new Error('Exact, directional ligation ends are required to design the two oligos.')
  }

  let guideCore = target
  let expressedGuide: string
  const enzymeName = prepared.part.downstreamOverhang?.enzymeName ?? prepared.part.upstreamOverhang?.enzymeName ?? 'restriction'
  let note = prepared.singleCut
    ? `PAM omitted. The vector is linearized at its single ${enzymeName} cut, and the annealed oligos ligate into that junction.`
    : 'PAM omitted. Annealed oligos carry the exact vector-compatible sticky ends.'
  if (prepared.recipeId) {
    const recipe = designPreLinearizedOligos(prepared.recipeId, target)
    if (!recipe.ok) throw new Error(recipe.error)
    expressedGuide = recipe.expressedGuide
    if (prepared.recipeId === 'guide-it-sgrna1') guideCore = expressedGuide
    note = `${recipe.note} PAM omitted.`
  } else {
    const minLength = prepared.family === 'SaCas9' ? 20 : 20
    const maxLength = prepared.family === 'SaCas9' ? 22 : 20
    if (target.length < minLength || target.length > maxLength) {
      throw new Error(`This ${prepared.family} vector expects a ${minLength === maxLength ? minLength : `${minLength}–${maxLength}`} nt target spacer.`)
    }
    const prefixAlways = prepared.cloningPair === 'BamHI + BsmBI/Esp3I'
    const suppliedG = /U6/i.test(prepared.promoterName) && promoterLip.endsWith('G')
    if (prefixAlways || (/U6/i.test(prepared.promoterName) && !suppliedG && !target.startsWith('G'))) {
      guideCore = `G${target}`
      note = `${prefixAlways ? 'The BamHI/BsmBI cassette requires' : 'U6 initiation uses'} an added leading G; the genomic PAM is omitted.`
      if (prepared.singleCut) note += ` The vector is linearized at its single ${enzymeName} cut, and the annealed oligos ligate into that junction.`
    }
    expressedGuide = `${suppliedG ? 'G' : ''}${guideCore}`
    if (prepared.cloningPair === 'BclI + SwaI') {
      note += ' BclI digestion is blocked by Dam methylation; prepare the vector in a dam− host or verify digestibility.'
    }
  }

  const topSequence = `${promoterLip}${guideCore}${prepared.scaffoldRestoration}${scaffoldLip}`
  const insertEnds = {
    upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: downstream },
    downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: upstream },
  }
  const strands = topStrandOligos(topSequence, downstream, upstream)
  if (prepared.recipeId) {
    const recipe = designPreLinearizedOligos(prepared.recipeId, target)
    if (!recipe.ok || recipe.sense !== strands.sense || recipe.antisense !== strands.antisense) {
      throw new Error('The recorded vector ends do not reconstruct the validated oligo recipe.')
    }
  }
  const now = nowIso()
  const guideStart = promoterLip.length - (expressedGuide.length - guideCore.length)
  const guideEnd = promoterLip.length + guideCore.length
  const feature: SequenceFeature = {
    id: createId('sgrna-guide'),
    name: guide.guide.name,
    type: 'misc_feature',
    color: '#16a34a',
    locations: [{ start: Math.max(0, guideStart), end: guideEnd, strand: 'forward' }],
    notes: serializeFeatureQualifiers({
      vibegene_sgrna: '1',
      vibegene_sgrna_id: createId('sgrna'),
      vibegene_sgrna_part: 'guide',
      vibegene_sgrna_nuclease: guide.nuclease,
      vibegene_sgrna_pam_motif: guide.pamMotif,
      vibegene_sgrna_pam_side: guide.pamSide,
      vibegene_sgrna_spacer: target,
      vibegene_sgrna_expressed_guide: expressedGuide,
      vibegene_sgrna_source_id: guide.id,
      note: `${guide.guide.name} cloned guide; target ${target}; expressed ${expressedGuide}; genomic PAM omitted`,
    }),
  }
  const record: SequenceRecord = {
    id: createId('seq'), name: `${guide.guide.name} annealed oligos`, description: 'sgRNA annealed oligo insert',
    molecule: 'dna', topology: 'linear', sequence: topSequence, features: [feature], primers: [], operations: [],
    dnaEnds: insertEnds, dnaEndsProvenance: 'user-defined', construct: prepared.record.construct,
    createdAt: now, updatedAt: now,
  }
  return {
    record,
    oligos: {
      ...strands, expressedGuide, senseModification: '5′ phosphate', antisenseModification: '5′ phosphate',
      note: `${note} Order both oligos with 5′ phosphate, or phosphorylate them before ligation.`,
    },
  }
}

function oligoAdditions(sequence: string, target: string) {
  const position = sequence.indexOf(target)
  return position < 0
    ? { added5: '', added3: '' }
    : { added5: sequence.slice(0, position), added3: sequence.slice(position + target.length) }
}

/** Keep the first name for any identical synthesis sequence and modification. */
export function uniqueSgRnaHistoryOligos(oligos: HistorySgRnaCloning['oligos']) {
  const seen = new Set<string>()
  return oligos.filter((oligo) => {
    const key = `${oligo.sequence.toUpperCase()}\u0000${oligo.modification}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function sgRnaHistoryOligosTsv(history: HistorySgRnaCloning): string {
  return exportPrimerDataTsv(uniqueSgRnaHistoryOligos(history.oligos).map((oligo, index) => ({
    id: `order-${index}`, name: `${oligo.name} [${oligo.modification}]`,
    sequence: oligo.sequence, color: '#16a34a',
  })))
}

function cloneOne(
  prepared: PreparedVector,
  guide: SgRNAAnnotation,
  compatibility: SgRnaCompatibility,
  choice: SgRnaCloningChoice,
  sourceVector: SequenceRecord,
): { oligos: SgRnaCloneOligos; insert: SequenceRecord; product: SequenceRecord } {
  const insert = makeInsert(prepared, guide)
  const insertConfig = defaultCloningPartConfig('insert', insert.record)
  const insertPart = resolveCloningPart(insertConfig, '#16a34a')
  if (!insertPart) throw new Error('The annealed guide insert could not be prepared.')
  const assembly = assembleRestrictionCloningProduct({
    vector: prepared.part, inserts: [insertPart], insertOrder: [0], productName: productName(prepared.record, guide),
  })
  if (!assembly.validation.ready || !assembly.validation.closed) throw new Error(assembly.validation.message)
  let product = assembly.record
  const expressed = insert.oligos.expressedGuide
  const scar = (prepared.singleCut ? prepared.part.upstreamOverhang?.sequence ?? '' : '').toUpperCase()
  const doubled = normalizeDna(product.sequence + product.sequence)
  const adjacentAt = doubled.indexOf(`${expressed}${prepared.scaffold}`)
  const scarredAt = scar ? doubled.indexOf(`${expressed}${scar}${prepared.scaffold}`) : -1
  const junctionStart = adjacentAt >= 0 ? adjacentAt : scarredAt
  if (junctionStart < 0) {
    throw new Error('The assembled guide-to-scaffold junction does not match the intended expressed guide and full scaffold.')
  }
  if (prepared.singleCut && adjacentAt < 0 && scarredAt >= 0) {
    insert.oligos.note += ` The ${scar} overhang from that cut stays between the guide and the scaffold.`
  }
  // A cut into the scaffold removes its first bases from the retained fragment.
  // The oligo restores them, so repair the parent feature's clipped 5′ boundary.
  if (prepared.scaffoldRestoration.length) {
    const length = product.sequence.length
    const scaffoldStart = (junctionStart + insert.oligos.expressedGuide.length) % length
    const clippedStart = (scaffoldStart + prepared.scaffoldRestoration.length) % length
    const existingIndex = product.features.findIndex((feature) =>
      /scaffold/i.test(feature.name) && feature.locations.some((location) => location.start === clippedStart))
    const locations = circularLocations(scaffoldStart, prepared.scaffold.length, length)
    if (existingIndex >= 0) {
      product.features = product.features.map((feature, index) => index === existingIndex ? { ...feature, locations } : feature)
    } else {
      product.features = [...product.features, {
        id: createId('feat'), name: prepared.scaffoldName, type: 'misc_RNA', color: '#16a34a', locations,
      }]
    }
  }
  // The genomic target PAM belongs to the target locus and is never cloned into the guide vector.
  // Existing assembly carries the guide-only feature and shifts the parental annotations.
  const oligoPrimers: Primer[] = [
    { id: createId('primer'), name: `${guide.guide.name}_sense`, sequence: insert.oligos.sense, color: '#16a34a', description: sgRnaOligoDescription('sense'), bindings: [] },
    { id: createId('primer'), name: `${guide.guide.name}_antisense`, sequence: insert.oligos.antisense, color: '#16a34a', description: sgRnaOligoDescription('antisense'), bindings: [] },
  ]
  product = {
    ...product,
    description: `sgRNA clone from ${prepared.record.name}; target spacer ${normalizeDna(guide.spacer)}`,
    primers: [...product.primers, ...oligoPrimers],
  }
  const createdAt = nowIso()
  const senseAdded = oligoAdditions(insert.oligos.sense, normalizeDna(guide.spacer))
  const antisenseAdded = oligoAdditions(insert.oligos.antisense, reverseComplement(normalizeDna(guide.spacer)))
  const promoterEnd = prepared.part.downstreamOverhang
  const scaffoldEnd = prepared.part.upstreamOverhang
  const endSummary = (end: typeof promoterEnd, modification: string) => ({
    ...(end?.enzymeName ? { enzyme: end.enzymeName } : {}),
    polarity: end?.type ?? 'unknown',
    overhang: end?.sequence ?? '',
    modification,
  })
  const cloning: HistorySgRnaCloning = {
    version: 1, createdAt,
    sourceVector: { id: sourceVector.id, name: sourceVector.name },
    cloningChoice: { label: choice.label, architecture: choice.architecture, kind: choice.kind },
    ends: {
      promoter: endSummary(promoterEnd, prepared.part.dnaEnds.downstream.modification),
      scaffold: endSummary(scaffoldEnd, prepared.part.dnaEnds.upstream.modification),
    },
    guides: [{
      sourceGuideId: guide.id, name: guide.guide.name, nuclease: guide.nuclease,
      targetSpacer: normalizeDna(guide.spacer), expressedGuide: insert.oligos.expressedGuide,
      compatibility: compatibility.status, compatibilityMessage: compatibility.message,
      addedSense5: senseAdded.added5, addedSense3: senseAdded.added3,
      addedAntisense5: antisenseAdded.added5, addedAntisense3: antisenseAdded.added3,
      productId: product.id, productName: product.name,
      warnings: compatibility.status === 'compatible' ? [] : [compatibility.message],
    }],
    oligos: oligoPrimers.map((primer) => ({
      name: primer.name, sequence: primer.sequence, modification: '5′ phosphate', guideId: guide.id,
    })),
  }
  product = {
    ...product,
    history: product.history ? {
      ...product.history,
      operation: 'cloneSgRNA',
      sgRnaCloning: cloning,
      oligos: cloning.oligos.map((oligo) => ({ name: oligo.name, sequence: oligo.sequence, description: oligo.modification })),
      primers: [...product.primers],
    } : undefined,
    operations: [...product.operations, {
      id: createId('op'), type: 'cloneSgRNA',
      summary: `Cloned ${guide.guide.name} into ${sourceVector.name} using ${choice.label}`,
      createdAt,
    }],
  }
  return { oligos: insert.oligos, insert: insert.record, product }
}

export function planSgRnaCloning(input: SgRnaCloningInput): SgRnaCloningPlan {
  const detection = detectCrispr(input.vector)
  const choices = choicesFromDetection(detection)
  const selectedChoice = typeof input.choice === 'string'
    ? choices.find((choice) => choice.id === input.choice) ?? null
    : input.choice ?? choices.find((choice) => choice.architecture !== 'single-junction') ?? choices[0] ?? null
  const issues: string[] = []
  if (!selectedChoice) issues.push('No guide-cloning cassette was detected. Select a verified pair of restriction sites or recorded vector ends.')
  let prepared: PreparedVector | null = null
  if (selectedChoice) {
    try { prepared = preparedVector(input, selectedChoice, detection) }
    catch (error) { issues.push(error instanceof Error ? error.message : 'The vector could not be prepared for sgRNA cloning.') }
  }
  const items: SgRnaCloningItem[] = input.guides.map((guide) => {
    const compatibility = compatibilityForGuide(guide, detection, selectedChoice?.cassette)
    const item: SgRnaCloningItem = { guide, compatibility, issues: [] }
    if (!prepared) {
      item.issues.push(...issues)
      return item
    }
    try {
      const clone = cloneOne(prepared, guide, compatibility, selectedChoice!, input.vector)
      item.oligos = clone.oligos
      item.insert = clone.insert
      item.product = clone.product
    } catch (error) {
      item.issues.push(error instanceof Error ? error.message : 'This guide could not be cloned into the selected vector.')
    }
    return item
  })
  const products = items.flatMap((item) => item.product ? [item.product] : [])
  const primers: Primer[] = items.flatMap((item) => item.oligos ? [
    { id: createId('primer'), name: `${item.guide.guide.name}_sense`, sequence: item.oligos.sense, color: '#16a34a', description: sgRnaOligoDescription('sense') },
    { id: createId('primer'), name: `${item.guide.guide.name}_antisense`, sequence: item.oligos.antisense, color: '#16a34a', description: sgRnaOligoDescription('antisense') },
  ] : [])
  const allOligos = products.flatMap((product) => product.history?.sgRnaCloning?.oligos ?? [])
  const primerListTsv = allOligos.length
    ? sgRnaHistoryOligosTsv({ ...products[0]!.history!.sgRnaCloning!, oligos: allOligos })
    : ''
  return { detection, choices, selectedChoice, items, products, primers, primerListTsv, issues }
}

/** Annotate the library consensus and every member with the cloning recipe. */
export function withSgRnaCloningLibraryHistory(library: SequenceRecord, products: readonly SequenceRecord[]): SequenceRecord {
  const recipes = products.flatMap((product) => product.history?.sgRnaCloning ? [product.history.sgRnaCloning] : [])
  if (!recipes.length) return library
  const createdAt = nowIso()
  const aggregate: HistorySgRnaCloning = {
    ...recipes[0]!, createdAt,
    guides: recipes.flatMap((recipe) => recipe.guides),
    oligos: uniqueSgRnaHistoryOligos(recipes.flatMap((recipe) => recipe.oligos)),
    library: { id: library.id, name: library.name },
  }
  const traceFiles = library.traceFiles?.map((member) => ({
    ...member,
    history: member.history?.sgRnaCloning ? {
      ...member.history,
      sgRnaCloning: { ...member.history.sgRnaCloning, library: aggregate.library },
    } : member.history,
  }))
  const history = {
    id: createId('history'), name: library.name, seqLen: library.sequence.length,
    circular: library.topology === 'circular', operation: 'cloneSgRNALibrary',
    resurrectable: false, hideHistory: false, oligos: [],
    regeneratedSites: [], inputSummaries: [], features: [], sequence: library.sequence,
    sgRnaCloning: aggregate, children: [],
  }
  return {
    ...library, history, traceFiles,
    dna: { ...library.dna, libraryMemberHistory: traceFiles?.flatMap((member) => member.history
      ? [{ memberId: member.id, fileName: member.fileName, history: member.history }] : []) },
    operations: [...library.operations, {
      id: createId('op'), type: 'cloneSgRNALibrary',
      summary: `Created ${library.name} with ${aggregate.guides.length} sgRNA cloning products from ${aggregate.sourceVector.name}`,
      createdAt,
    }],
  }
}
