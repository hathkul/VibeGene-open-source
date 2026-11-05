import { groupSgRNAFeatures, matchesIupacPam, sgRnaCas12aIllustrativeCuts, sgRnaNominalCut, type SgRNAAnnotation } from '../../domain/sgrna'
import { reverseComplement } from '../../domain/sequence'
import type { FeatureSegment, SequenceRecord } from '../../domain/types'
import { applySequenceEditTransition } from './sequenceEditTransition'

export type CrisprExcisionPlan = {
  cuts: [number, number]
  guides: [SgRNAAnnotation, SgRNAAnnotation]
  sites: [CrisprCutSite, CrisprCutSite]
}

export type CrisprCutSite = { top: number; bottom: number; guide: SgRNAAnnotation }

/** Only use exact, still-matching target pairs from the document being edited. */
export function planCrisprExcision(record: SequenceRecord, guides: readonly SgRNAAnnotation[]): CrisprExcisionPlan | null {
  if (record.molecule !== 'dna' || guides.length !== 2 || guides[0]!.id === guides[1]!.id) return null
  const currentGuides = groupSgRNAFeatures(record.features)
  const resolved = guides.map((guide) => currentGuides.find((item) => item.id === guide.id && item.guide.id === guide.guide.id))
  if (!resolved[0] || !resolved[1]) return null
  const sites = resolved.map((guide) => {
    if (!guide || !guide.pam) return null
    const blunt = sgRnaNominalCut(guide, record.sequence.length, record.topology)
    const staggered = sgRnaCas12aIllustrativeCuts(guide, record.sequence.length, record.topology)
    if (blunt === null && (!staggered || staggered.nonTarget === null || staggered.target === null)) return null
    const first = guide.guide.locations[0]!
    const n = record.sequence.length
    const pamLength = guide.observedPam.length
    const pamStart = first.start + (guide.pamSide === '3prime'
      ? (first.strand === 'forward' ? guide.spacer.length : -pamLength)
      : (first.strand === 'forward' ? -pamLength : guide.spacer.length))
    function matchesInterval(locations: FeatureSegment[], start: number, length: number) {
      if (record.topology === 'linear' && (start < 0 || start + length > n)) return false
      const offset = ((start % n) + n) % n
      const expected = offset + length <= n ? [[offset, offset + length]] : [[offset, n], [0, offset + length - n]]
      return locations.length === expected.length && locations.every((loc, index) =>
        loc.start === expected[index]![0] && loc.end === expected[index]![1] && loc.strand === first.strand)
    }
    if (!matchesInterval(guide.guide.locations, first.start, guide.spacer.length) ||
        !matchesInterval(guide.pam.locations, pamStart, pamLength)) return null
    const read = (locations: FeatureSegment[]) => {
      const dna = locations.map((loc) => record.sequence.slice(loc.start, loc.end)).join('').toUpperCase()
      return first.strand === 'reverse' ? reverseComplement(dna) : dna
    }
    const pam = read(guide.pam.locations)
    if (read(guide.guide.locations) !== guide.spacer.toUpperCase() || pam !== guide.observedPam.toUpperCase() ||
        !matchesIupacPam(pam, guide.pamMotif)) return null
    if (blunt !== null) return { top: blunt, bottom: blunt, guide }
    const top = first.strand === 'forward' ? staggered!.nonTarget! : staggered!.target!
    const bottom = first.strand === 'forward' ? staggered!.target! : staggered!.nonTarget!
    return { top, bottom, guide }
  })
  if (!sites[0] || !sites[1] || sites[0].top === sites[1].top) return null
  const ordered = [sites[0], sites[1]].sort((a, b) => a.top - b.top) as [CrisprCutSite, CrisprCutSite]
  return { cuts: [ordered[0].top, ordered[1].top], guides: [resolved[0], resolved[1]], sites: ordered }
}

/** Remove the selected arc, using ordinary sequence-edit transitions for coordinates and history. */
export function applyCrisprExcision(record: SequenceRecord, plan: CrisprExcisionPlan, arc: 'between' | 'across-origin'): SequenceRecord {
  const [start, end] = plan.cuts
  if (arc === 'across-origin' && record.topology !== 'circular') throw new Error('Origin-spanning excision requires a circular sequence.')
  const intervals = arc === 'between' ? [{ start, end }] : [{ start: end, end: record.sequence.length }, { start: 0, end: start }].filter((part) => part.end > part.start)
  // A clipped guide or PAM is no longer a valid mapping; remove the linked pair.
  const damaged = new Set(groupSgRNAFeatures(record.features).filter((annotation) =>
    [annotation.guide, annotation.pam].some((feature) => feature?.locations.some((loc) =>
      intervals.some((interval) => loc.start < interval.end && loc.end > interval.start))),
  ).flatMap((annotation) => [annotation.guide.id, ...(annotation.pam ? [annotation.pam.id] : [])]))
  let result = record
  for (const interval of intervals) {
    const nextSequence = result.sequence.slice(0, interval.start) + result.sequence.slice(interval.end)
    result = applySequenceEditTransition(result, { nextSequence, replacement: { ...interval, insertedLength: 0 } })
  }
  return { ...result, features: result.features.filter((feature) => !damaged.has(feature.id)) }
}
