/**
 * Detect shark VNAR / IgNAR variable domains from sequence.
 *
 * VNARs lack a conventional CDR2; the former C′/C″ strands are replaced by
 * short HV2 and HV4 loops. Conserved framework motifs (especially the FR3
 * GSKSFSLRI core and TRVDQTP / AWVDQTP FR1) distinguish them from VH/VHH.
 *
 * Region order: FR1–CDR1–FR2–HV2–FR3a–HV4–FR3b–CDR3–FR4.
 * Types I–IV follow the classic non-canonical cysteine patterns.
 */

export type VnarType = 'I' | 'II' | 'III' | 'IV'

export type VnarRegionName =
  | 'FR1'
  | 'CDR1'
  | 'FR2'
  | 'HV2'
  | 'FR3a'
  | 'HV4'
  | 'FR3b'
  | 'CDR3'
  | 'FR4'

export type VnarRegion = {
  name: VnarRegionName
  start: number
  end: number
}

export type VnarDetection = {
  scheme: 'vnar'
  vnarType: VnarType
  confidence: number
  queryStart: number
  queryEnd: number
  regions: VnarRegion[]
  /** Labels such as FR1.12, CDR1.3, HV2.1, CDR3.8; null outside the domain. */
  positions: Array<string | null>
  /** Sequence indices of the canonical FR1–FR3 disulfide cysteines. */
  canonicalCysteines: [number, number] | null
  /** Extra disulfide pairs predicted from type-specific cysteine patterns. */
  extraDisulfides: Array<[number, number]>
}

const MIN_CONFIDENCE = 0.58
const MIN_DOMAIN_LENGTH = 85
const MAX_DOMAIN_LENGTH = 160

function sanitizeProtein(sequence: string) {
  return sequence.replace(/[^A-Za-z*]/g, '').toUpperCase()
}

type MotifHit = { start: number; end: number; score: number }

function findMotif(
  sequence: string,
  pattern: RegExp,
  score: number,
): MotifHit[] {
  const hits: MotifHit[] = []
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let match: RegExpExecArray | null
  while ((match = global.exec(sequence)) !== null) {
    hits.push({ start: match.index, end: match.index + match[0].length, score })
    if (match[0].length === 0) global.lastIndex += 1
  }
  return hits
}

function bestScoreInWindow(hits: MotifHit[], windowStart: number, windowEnd: number) {
  let best = 0
  for (const hit of hits) {
    if (hit.start >= windowStart && hit.end <= windowEnd) best = Math.max(best, hit.score)
  }
  return best
}

function firstHitInWindow(hits: MotifHit[], windowStart: number, windowEnd: number) {
  return hits.find((hit) => hit.start >= windowStart && hit.end <= windowEnd) ?? null
}

function lastHitInWindow(hits: MotifHit[], windowStart: number, windowEnd: number) {
  const matches = hits.filter((hit) => hit.start >= windowStart && hit.end <= windowEnd)
  return matches.length ? matches[matches.length - 1] : null
}

/** Score a candidate FR1→FR4 span using conserved VNAR framework motifs. */
function scoreDomain(sequence: string, start: number, end: number) {
  const domain = sequence.slice(start, end)
  if (domain.length < MIN_DOMAIN_LENGTH || domain.length > MAX_DOMAIN_LENGTH) {
    return { score: 0, confidence: 0 }
  }

  const maxScore = 2.4 + 2.6 + 1.4 + 1.6 + 1.5 + 3.2 + 1.8 + 2.4
  const total = bestScoreInWindow(findMotif(domain, /[AT][RW]VDQTP[RQE]/i, 2.4), 0, 12)
    + bestScoreInWindow(findMotif(domain, /[TK][KER]ETGESLT[IVK]/i, 2.6), 5, 30)
    + bestScoreInWindow(findMotif(domain, /WY[RK]/i, 1.4), 20, 55)
    + bestScoreInWindow(findMotif(domain, /N[EK][QKE][ST]I[SKD]/i, 1.6), 35, 70)
    + bestScoreInWindow(findMotif(domain, /[IGK]GGRY[VED]/i, 1.5), 40, 80)
    + bestScoreInWindow(findMotif(domain, /[GS][ST][KR]SFSLRI[KNST]/i, 3.2), 45, 95)
    + bestScoreInWindow(findMotif(domain, /[GA]TY[KR]C/i, 1.8), 55, domain.length - 8)
    + bestScoreInWindow(findMotif(domain, /G[ADEGW]GT[AV][LV]TV[KNA]/i, 2.4), domain.length - 20, domain.length)

  return { score: total, confidence: Math.min(1, total / maxScore) }
}

function findCanonicalCysteines(domain: string): [number, number] | null {
  // First Cys is typically near FR1 end (~21); second near FR3b end (~82+CDR3 offset).
  const early = [...domain.slice(15, 30)].flatMap((residue, offset) => (
    residue === 'C' ? [15 + offset] : []
  ))
  const lateWindowStart = Math.max(55, Math.floor(domain.length * 0.55))
  const lateWindowEnd = Math.min(domain.length - 10, Math.floor(domain.length * 0.85))
  const late = [...domain.slice(lateWindowStart, lateWindowEnd)].flatMap((residue, offset) => (
    residue === 'C' ? [lateWindowStart + offset] : []
  ))
  if (!early.length || !late.length) return null
  // Prefer the earliest early Cys and the Cys nearest a GTY[KR]C / ATY[IC]C motif.
  const motif = /[GA]T[YI][KR]?C|[GA]TY[KR]C/i.exec(domain.slice(lateWindowStart, lateWindowEnd))
  let second = late[0]
  if (motif) {
    const motifCys = lateWindowStart + motif.index + motif[0].lastIndexOf('C')
    if (late.includes(motifCys)) second = motifCys
  } else {
    second = late.reduce((best, index) => (
      Math.abs(index - 82) < Math.abs(best - 82) ? index : best
    ))
  }
  return [early[0], second]
}

function classifyVnarType(
  domain: string,
  regions: VnarRegion[],
  canonical: [number, number] | null,
): VnarType {
  const regionOf = (index: number) => {
    const named = regions.find((region) => index >= region.start && index < region.end)?.name
    if (named) return named
    return null
  }
  const cysteines = [...domain].flatMap((residue, index) => (residue === 'C' ? [index] : []))
  const nonCanonical = cysteines.filter((index) => (
    !canonical || (index !== canonical[0] && index !== canonical[1])
  ))
  if (!nonCanonical.length) return 'IV'

  // Type I FR2/FR4 cysteines often sit immediately before the WYRK / GxGT motifs.
  const fr2Motif = /WY[RK]/i.exec(domain)
  const fr4Motif = /G[ADEGW]GT[AV][LV]TV[KNA]/i.exec(domain)
  const nearFr2 = (index: number) => Boolean(fr2Motif && index >= fr2Motif.index - 3 && index < fr2Motif.index + 3)
  const nearFr4 = (index: number) => Boolean(fr4Motif && index >= fr4Motif.index - 3 && index <= fr4Motif.index + 2)

  const inCdr1 = nonCanonical.filter((index) => regionOf(index) === 'CDR1' && !nearFr2(index))
  const inCdr3 = nonCanonical.filter((index) => regionOf(index) === 'CDR3' && !nearFr4(index))
  const inFr2 = nonCanonical.filter((index) => regionOf(index) === 'FR2' || nearFr2(index))
  const inFr4 = nonCanonical.filter((index) => regionOf(index) === 'FR4' || nearFr4(index))

  if ((inFr2.length && inFr4.length) || (inFr2.length && inCdr3.length >= 2 && inFr4.length)) {
    return 'I'
  }
  if (inFr2.length && inCdr3.length >= 2) return 'I'
  if (inCdr1.length && inCdr3.length) {
    const cdr1 = regions.find((region) => region.name === 'CDR1')
    if (cdr1) {
      const cdr1Seq = domain.slice(cdr1.start, cdr1.end)
      if (cdr1Seq.includes('W')) return 'III'
    }
    return 'II'
  }
  if (inCdr3.length >= 2 && inFr2.length) return 'I'
  return 'IV'
}

function buildRegions(
  domain: string,
  start: number,
  canonical: [number, number] | null,
): VnarRegion[] {
  const length = domain.length
  const c1 = canonical?.[0] ?? 21
  const c2 = canonical?.[1] ?? Math.min(82, length - 15)

  const fr2Hit = firstHitInWindow(findMotif(domain, /WY[RK]/i, 1), c1 + 4, c1 + 30)
  const hv2Hit = firstHitInWindow(findMotif(domain, /N[EK][QKE][ST]I[SKD]/i, 1), c1 + 10, c2 - 10)
  const fr3Hit = firstHitInWindow(findMotif(domain, /[GS][ST][KR]SFSLRI[KNST]/i, 1), c1 + 15, c2 + 5)
  const fr4Hit = lastHitInWindow(findMotif(domain, /G[ADEGW]GT[AV][LV]TV[KNA]/i, 1), c2 + 3, length)

  const fr1End = Math.max(c1 + 1, Math.min(c1 + 3, length))
  // Include a possible Type I Cys immediately before WYRK in FR2.
  const fr2Start = fr2Hit ? Math.max(fr1End, fr2Hit.start - 2) : Math.min(fr1End + 9, length)
  const cdr1End = fr2Start
  const fr2End = hv2Hit ? hv2Hit.start : Math.min(cdr1End + 12, length)
  const hv2End = hv2Hit ? Math.min(hv2Hit.end + 2, length) : Math.min(fr2End + 8, length)
  const fr3CoreStart = fr3Hit ? fr3Hit.start : Math.min(hv2End + 12, length)
  const hv4Start = Math.max(hv2End, Math.min(fr3CoreStart - 6, length))
  const hv4End = Math.max(hv4Start, Math.min(fr3CoreStart, length))
  const fr3aEnd = hv4Start
  // Include a possible Type I Cys immediately before the FR4 GxGT motif in FR4.
  const fr4StartRaw = fr4Hit ? fr4Hit.start : Math.max(c2 + 8, length - 12)
  const fr4Start = Math.max(c2 + 2, fr4StartRaw - 2)
  const fr3bEnd = Math.min(Math.max(c2 + 2, hv4End + 1), fr4Start)
  const cdr3Start = Math.min(fr3bEnd, fr4Start)

  const specs: Array<{ name: VnarRegionName; localStart: number; localEnd: number }> = [
    { name: 'FR1', localStart: 0, localEnd: fr1End },
    { name: 'CDR1', localStart: fr1End, localEnd: cdr1End },
    { name: 'FR2', localStart: cdr1End, localEnd: fr2End },
    { name: 'HV2', localStart: fr2End, localEnd: hv2End },
    { name: 'FR3a', localStart: hv2End, localEnd: fr3aEnd },
    { name: 'HV4', localStart: hv4Start, localEnd: hv4End },
    { name: 'FR3b', localStart: hv4End, localEnd: fr3bEnd },
    { name: 'CDR3', localStart: cdr3Start, localEnd: fr4Start },
    { name: 'FR4', localStart: fr4Start, localEnd: length },
  ]

  const regions: VnarRegion[] = []
  for (const spec of specs) {
    const localStart = Math.max(0, Math.min(length, spec.localStart))
    const localEnd = Math.max(localStart, Math.min(length, spec.localEnd))
    if (localEnd <= localStart) continue
    const clippedStart = regions.length ? Math.max(localStart, regions[regions.length - 1].end - start) : localStart
    const clippedEnd = Math.max(clippedStart, localEnd)
    if (clippedEnd <= clippedStart) continue
    regions.push({
      name: spec.name,
      start: start + clippedStart,
      end: start + clippedEnd,
    })
  }
  return regions
}

function buildPositions(sequenceLength: number, regions: VnarRegion[]) {
  const positions = Array<string | null>(sequenceLength).fill(null)
  for (const region of regions) {
    let offset = 1
    for (let index = region.start; index < region.end; index += 1) {
      positions[index] = `${region.name}.${offset}`
      offset += 1
    }
  }
  return positions
}

function predictExtraDisulfides(
  domain: string,
  domainStart: number,
  regions: VnarRegion[],
  vnarType: VnarType,
  canonical: [number, number] | null,
): Array<[number, number]> {
  const regionOf = (localIndex: number) => (
    regions.find((region) => {
      const localStart = region.start - domainStart
      const localEnd = region.end - domainStart
      return localIndex >= localStart && localIndex < localEnd
    })?.name
  )
  const cysteines = [...domain].flatMap((residue, index) => (residue === 'C' ? [index] : []))
  const nonCanonical = cysteines.filter((index) => (
    !canonical || (index !== canonical[0] && index !== canonical[1])
  ))
  const pairs: Array<[number, number]> = []

  const pick = (leftNames: VnarRegionName[], rightNames: VnarRegionName[]) => {
    const left = nonCanonical.filter((index) => leftNames.includes(regionOf(index) as VnarRegionName))
    const right = nonCanonical.filter((index) => rightNames.includes(regionOf(index) as VnarRegionName))
    if (left.length && right.length) {
      pairs.push([domainStart + left[0], domainStart + right[0]])
    }
  }

  if (vnarType === 'II' || vnarType === 'III') pick(['CDR1'], ['CDR3'])
  if (vnarType === 'I') {
    pick(['FR2'], ['CDR3'])
    pick(['FR4'], ['CDR3'])
    const cdr3 = nonCanonical.filter((index) => regionOf(index) === 'CDR3')
    if (cdr3.length >= 2) pairs.push([domainStart + cdr3[0], domainStart + cdr3[1]])
  }
  return pairs
}

function findCandidateStarts(sequence: string) {
  const starts = new Set<number>()
  for (const hit of findMotif(sequence, /[AT][RW]VDQTP/i, 1)) starts.add(hit.start)
  for (const hit of findMotif(sequence, /TRVDQTP/i, 1)) starts.add(hit.start)
  // Also allow a few residues before a strong ETGESLT motif.
  for (const hit of findMotif(sequence, /[TK][KER]ETGESLT/i, 1)) {
    starts.add(Math.max(0, hit.start - 12))
    starts.add(Math.max(0, hit.start - 14))
  }
  if (!starts.size) {
    for (let index = 0; index < sequence.length - MIN_DOMAIN_LENGTH; index += 1) starts.add(index)
  }
  return [...starts].sort((left, right) => left - right)
}

function findCandidateEnds(sequence: string, start: number) {
  const ends = new Set<number>()
  const window = sequence.slice(start, Math.min(sequence.length, start + MAX_DOMAIN_LENGTH))
  for (const hit of findMotif(window, /G[ADEGW]GT[AV][LV]TV[KNA]/i, 1)) {
    ends.add(start + hit.end)
  }
  // Fallback ends at typical VNAR lengths.
  for (const length of [100, 105, 110, 112, 115, 118, 120, 125, 130]) {
    if (start + length <= sequence.length) ends.add(start + length)
  }
  if (sequence.length - start >= MIN_DOMAIN_LENGTH) ends.add(Math.min(sequence.length, start + MAX_DOMAIN_LENGTH))
  return [...ends].sort((left, right) => left - right)
}

/** Detect a shark VNAR / IgNAR variable domain in a protein sequence. */
export function detectVnar(sequenceInput: string): VnarDetection {
  const sequence = sanitizeProtein(sequenceInput)
  if (sequence.length < MIN_DOMAIN_LENGTH) {
    throw new Error('No VNAR / IgNAR domain was detected.')
  }

  let best: {
    start: number
    end: number
    confidence: number
    score: number
  } | null = null

  for (const start of findCandidateStarts(sequence)) {
    for (const end of findCandidateEnds(sequence, start)) {
      if (end - start < MIN_DOMAIN_LENGTH) continue
      const scored = scoreDomain(sequence, start, end)
      // Require the distinctive FR3 core for auto-accept.
      const domain = sequence.slice(start, end)
      const hasFr3Core = /[GS][ST][KR]SFSLRI[KNST]/.test(domain)
      const hasFr1 = /[ATRW]VDQTP/.test(domain.slice(0, 20)) || /ETGESLT/.test(domain.slice(0, 35))
      if (!hasFr3Core || !hasFr1) continue
      if (scored.confidence < MIN_CONFIDENCE) continue
      if (!best || scored.confidence > best.confidence || (scored.confidence === best.confidence && scored.score > best.score)) {
        best = { start, end, confidence: scored.confidence, score: scored.score }
      }
    }
  }

  if (!best) throw new Error('No VNAR / IgNAR domain was detected.')

  const domain = sequence.slice(best.start, best.end)
  const localCanonical = findCanonicalCysteines(domain)
  const regions = buildRegions(domain, best.start, localCanonical)
  const vnarType = classifyVnarType(domain, regions.map((region) => ({
    ...region,
    start: region.start - best.start,
    end: region.end - best.start,
  })), localCanonical)
  // Re-build regions already absolute; classification used local copies.
  const absoluteCanonical: [number, number] | null = localCanonical
    ? [best.start + localCanonical[0], best.start + localCanonical[1]]
    : null
  const extraDisulfides = predictExtraDisulfides(
    domain,
    best.start,
    regions,
    vnarType,
    localCanonical,
  )

  return {
    scheme: 'vnar',
    vnarType,
    confidence: best.confidence,
    queryStart: best.start,
    queryEnd: best.end,
    regions,
    positions: buildPositions(sequence.length, regions),
    canonicalCysteines: absoluteCanonical,
    extraDisulfides,
  }
}
