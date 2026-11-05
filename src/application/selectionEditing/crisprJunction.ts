import type { SequenceRecord } from '../../domain/types'
import type { CrisprCutSite, CrisprExcisionPlan } from './crisprExcision'

export type CrisprArc = 'between' | 'across-origin'
export type JunctionSettings = { arc: CrisprArc; sites: [CrisprCutSite, CrisprCutSite]; leftFill: number; rightFill: number }
export type JunctionPreview = {
  leftOverhang: string
  rightOverhang: string
  leftRemaining: string
  rightRemaining: string
  sequence: string
  leftBoundary: number
  rightBoundary: number
  deletionPlan: CrisprExcisionPlan
  deletionArc: CrisprArc
}

/** A 5′ overhang's size; coordinates are boundaries on the stored plus strand. */
export function cutOverhangLength(site: CrisprCutSite, record: Pick<SequenceRecord, 'sequence' | 'topology'>): number {
  const difference = site.bottom - site.top
  return record.topology === 'circular' && difference < 0 ? difference + record.sequence.length : difference
}

export function previewCrisprJunction(record: SequenceRecord, original: CrisprExcisionPlan, settings: JunctionSettings): { preview: JunctionPreview | null; error: string; ends?: Pick<JunctionPreview, 'leftOverhang' | 'rightOverhang' | 'leftRemaining' | 'rightRemaining'> } {
  const n = record.sequence.length
  const { sites, arc, leftFill, rightFill } = settings
  if (arc === 'across-origin' && record.topology !== 'circular') return { preview: null, error: 'The origin-spanning region requires circular DNA.' }
  for (const site of sites) {
    const limit = record.topology === 'circular' ? n - 1 : n
    const length = cutOverhangLength(site, record)
    if (!Number.isInteger(site.top) || !Number.isInteger(site.bottom) || site.top < 0 || site.bottom < 0 || site.top > limit || site.bottom > limit || length < 0 || length > 10) {
      return { preview: null, error: 'Enter valid strand cuts with a 5′ overhang of at most 10 bases.' }
    }
  }
  if (sites[0].top >= sites[1].top) return { preview: null, error: 'The first cut must be before the second cut on the displayed sequence.' }
  const [low, high] = sites
  if (record.topology === 'linear' && (low.top === 0 || high.bottom === n)) {
    return { preview: null, error: 'Both retained ends need double-stranded DNA beyond their cut sites.' }
  }
  if (low.top + cutOverhangLength(low, record) > high.top ||
      (record.topology === 'circular' && high.top + cutOverhangLength(high, record) > low.top + n) ||
      (record.topology === 'linear' && high.bottom > n)) {
    return { preview: null, error: 'The two cut regions overlap.' }
  }
  const left = arc === 'between' ? low : high
  const right = arc === 'between' ? high : low
  const leftLength = cutOverhangLength(left, record)
  const rightLength = cutOverhangLength(right, record)
  if (!Number.isInteger(leftFill) || !Number.isInteger(rightFill) || leftFill < 0 || leftFill > leftLength || rightFill < 0 || rightFill > rightLength) {
    return { preview: null, error: 'Select a fill length within each overhang.' }
  }
  const slice = (start: number, length: number) => record.topology === 'circular'
    ? (record.sequence + record.sequence).slice(start, start + length).toUpperCase()
    : record.sequence.slice(start, start + length).toUpperCase()
  const leftOverhang = slice(left.top, leftLength)
  const rightOverhang = slice(right.top, rightLength)
  const leftRemaining = leftOverhang.slice(leftFill)
  const rightRemaining = rightOverhang.slice(0, rightLength - rightFill)
  const ends = { leftOverhang, rightOverhang, leftRemaining, rightRemaining }
  if (leftRemaining !== rightRemaining) return { preview: null, ends, error: 'Remaining sticky ends are incompatible. Adjust the fill lengths or fill both ends completely.' }
  const leftBoundary = record.topology === 'circular' ? (left.top + leftFill) % n : left.top + leftFill
  const rightBoundary = right.top
  if (leftBoundary === rightBoundary) return { preview: null, error: 'The cuts leave no excised region.' }
  const deletionArc: CrisprArc = leftBoundary < rightBoundary ? 'between' : 'across-origin'
  const cuts: [number, number] = [Math.min(leftBoundary, rightBoundary), Math.max(leftBoundary, rightBoundary)]
  const sequence = deletionArc === 'between'
    ? record.sequence.slice(0, cuts[0]) + record.sequence.slice(cuts[1])
    : record.sequence.slice(cuts[0], cuts[1])
  if (!sequence.length) return { preview: null, error: 'The excision would remove the entire sequence.' }
  return { preview: { ...ends, sequence, leftBoundary, rightBoundary,
    deletionPlan: { ...original, cuts }, deletionArc }, error: '' }
}
