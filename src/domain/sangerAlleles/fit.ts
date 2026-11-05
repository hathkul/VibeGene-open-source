import { reverseComplement } from '../sequence'
import { BASES, type EvidenceTrace } from './peaks'

export type AlleleEdit = { start: number; end: number; inserted: string; label: string }
export type AlleleAlternative = { edit: AlleleEdit; reason: 'same-profile' | 'similar-fit' }
export type FittedAllele = { edit: AlleleEdit; fraction: number; ambiguous: boolean; alternatives: AlleleAlternative[]; alternativesTruncated: boolean }
export type AlleleFit = { alleles: FittedAllele[]; fit: number; positions: number; perRead: { name: string; fit: number }[]; warnings: string[] }
export type AlleleCandidateOptions = { localIndels: boolean; segmentDeletions: boolean }
export const defaultAlleleCandidateOptions: AlleleCandidateOptions = { localIndels: true, segmentDeletions: true }

/** Enumerate cut-local indels and, for two guides, segment-deletion candidates. */
export function candidateEdits(reference: string, cuts: readonly number[], options: AlleleCandidateOptions = defaultAlleleCandidateOptions): AlleleEdit[] {
  const n = reference.length
  const bySequence = new Map<string, AlleleEdit>()
  const add = (start: number, end: number, inserted: string) => {
    if (start < 0 || end > n || start > end || (start === end && !inserted)) return
    const removed = end - start
    const segment = cuts.length === 2 && removed > 0 && start <= Math.min(...cuts) + 3 && end >= Math.max(...cuts) - 3
    if (segment ? !options.segmentDeletions : !options.localIndels) return
    // Junction insertions are indels too, even when paired with a segment deletion.
    if (segment && inserted && !options.localIndels) return
    const sequence = reference.slice(0, start) + inserted + reference.slice(end)
    if (!sequence.length || sequence === reference || bySequence.has(sequence)) return
    bySequence.set(sequence, { start, end, inserted, label: `${segment ? 'Segment deletion' : 'Local indel'}: ${removed ? `−${removed} bp` : ''}${inserted ? `+${inserted}` : ''} at ${start + 1}` })
  }
  for (const cut of cuts) {
    for (let length = 1; length <= 50; length++) {
      const offsets = new Set([0, Math.min(length, 1), Math.min(length, 2), Math.min(length, 3), length])
      for (const left of offsets) {
        add(cut - left, cut - left + length, '')
        if (length <= 10) for (const base of BASES) add(cut - left, cut - left + length, base)
      }
    }
    for (let shift = -2; shift <= 2; shift++) {
      for (const base of BASES) {
        add(cut + shift, cut + shift, base)
        for (const second of BASES) add(cut + shift, cut + shift, base + second)
      }
    }
  }
  if (cuts.length === 2) {
    const [left, right] = [...cuts].sort((a, b) => a - b)
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      if (left! + a >= right! + b) continue
      add(left! + a, right! + b, '')
      for (const base of BASES) add(left! + a, right! + b, base)
    }
  }
  return [{ start: 0, end: 0, inserted: '', label: 'Reference' }, ...bySequence.values()]
}

function projectSimplex(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => b - a)
  let sum = 0, theta = 0
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i]!
    const t = (sum - 1) / (i + 1)
    if (sorted[i]! > t) theta = t
  }
  return values.map((value) => Math.max(0, value - theta))
}

/** Fit simplex-constrained nonnegative mixture weights for a small selected set. */
function fitSubset(indices: number[], gram: (a: number, b: number) => number, correlation: Float64Array, y2: number, count: number) {
  let weights = indices.map(() => 1 / indices.length)
  const step = 1 / (2 * count * indices.length)
  for (let iter = 0; iter < 180; iter++) {
    const next = projectSimplex(weights.map((weight, i) => {
      let value = -correlation[indices[i]!]!
      for (let j = 0; j < indices.length; j++) value += gram(indices[i]!, indices[j]!) * weights[j]!
      return weight - step * 2 * value
    }))
    const delta = next.reduce((sum, value, i) => sum + Math.abs(value - weights[i]!), 0)
    weights = next
    if (delta < 1e-7) break
  }
  let sse = y2
  for (let i = 0; i < indices.length; i++) {
    sse -= 2 * weights[i]! * correlation[indices[i]!]!
    for (let j = 0; j < indices.length; j++) sse += weights[i]! * weights[j]! * gram(indices[i]!, indices[j]!)
  }
  return { weights, sse: Math.max(0, sse) }
}

/** Sparse candidate selection on per-base peak fractions, jointly across a read group. */
export function fitAlleles(reference: string, cuts: readonly number[], reads: readonly EvidenceTrace[], options: AlleleCandidateOptions = defaultAlleleCandidateOptions): AlleleFit {
  const candidates = candidateEdits(reference, cuts, options)
  const positions = reads.map((read) => {
    const cutTrace = read.anchorTrace + read.cut - read.anchorReference
    const start = Math.max(read.anchorTrace + 1, cutTrace - 55)
    const end = Math.min(read.peaks.length, cutTrace + 120)
    return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index)
      .filter((index) => read.peaks[index]!.reduce((a, b) => a + b, 0) > 0.5)
  })
  if (positions.some((entries, index) => entries.filter((position) => position >= reads[index]!.anchorTrace + reads[index]!.cut - reads[index]!.anchorReference).length < 30)) throw new Error('At least 30 usable peak positions after the cut are required for each read.')
  const observed = reads.flatMap((read, index) => positions[index]!.map((p) => read.peaks[p]!))
  const m = observed.length
  const y2 = observed.reduce((sum, row) => sum + row.reduce((a, b) => a + b * b, 0), 0)
  const profiles: Uint8Array[] = []
  const representative: AlleleEdit[] = []
  const equivalentEdits: AlleleEdit[][] = []
  const signatures = new Map<string, number>()
  for (const candidate of candidates) {
    const profile = new Uint8Array(m)
    let offset = 0, valid = true
    for (let r = 0; r < reads.length; r++) {
      const read = reads[r]!
      const reverse = read.orientation === 'reverse'
      const start = reverse ? reference.length - candidate.end : candidate.start
      const end = reverse ? reference.length - candidate.start : candidate.end
      const insert = reverse ? reverseComplement(candidate.inserted) : candidate.inserted
      // An anchor inside or downstream of an edit cannot establish that allele's phase.
      if ((candidate.start !== candidate.end || candidate.inserted) && start <= read.anchorReference) { valid = false; break }
      for (const position of positions[r]!) {
        const alleleIndex = read.anchorReference + position - read.anchorTrace
        const sourceIndex = alleleIndex < start ? alleleIndex : alleleIndex - insert.length + end - start
        const base = alleleIndex >= start && alleleIndex < start + insert.length ? insert[alleleIndex - start] : read.reference[sourceIndex]
        const baseIndex = base ? BASES.indexOf(base) : -1
        if (baseIndex < 0) { valid = false; break }
        profile[offset++] = baseIndex
      }
      if (!valid) break
    }
    if (!valid) continue
    // Equivalent profiles cannot identify which underlying sequence was present.
    const signature = Array.from(profile, (value) => BASES[value]).join('')
    const prior = signatures.get(signature)
    if (prior !== undefined) { equivalentEdits[prior]!.push(candidate); continue }
    signatures.set(signature, profiles.length)
    profiles.push(profile)
    representative.push(candidate)
    equivalentEdits.push([])
  }
  if (!profiles.length) throw new Error('No candidate alleles can be evaluated within the trace coverage.')
  const correlation = Float64Array.from(profiles, (profile) => profile.reduce((sum, base, index) => sum + observed[index]![base]!, 0))
  const gramCache = new Map<string, number>()
  const gram = (a: number, b: number) => {
    if (a === b) return m
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const cached = gramCache.get(key)
    if (cached !== undefined) return cached
    let score = 0
    for (let i = 0; i < m; i++) if (profiles[a]![i] === profiles[b]![i]) score++
    gramCache.set(key, score)
    return score
  }
  let best = 0
  for (let i = 1; i < profiles.length; i++) if (correlation[i]! > correlation[best]!) best = i
  const selected = [best]
  let fit = fitSubset(selected, gram, correlation, y2, m)
  for (let iteration = 1; iteration < 4; iteration++) {
    let bestCandidate = -1
    let bestFit = fit
    for (let i = 0; i < profiles.length; i++) {
      if (selected.includes(i)) continue
      const attempt = fitSubset([...selected, i], gram, correlation, y2, m)
      if (attempt.weights.at(-1)! >= 0.06 && attempt.sse < bestFit.sse - 1e-8) { bestCandidate = i; bestFit = attempt }
    }
    if (bestCandidate < 0 || fit.sse - bestFit.sse < m * 0.005) break
    selected.push(bestCandidate)
    fit = bestFit
  }
  const alleles = selected.map((index, i) => {
    // Limit display and refitting work for highly repetitive templates.
    const maxAlternatives = 20
    const alternatives: AlleleAlternative[] = []
    let alternativesTruncated = false
    const addAlternative = (edit: AlleleEdit, reason: AlleleAlternative['reason']) => {
      if (alternatives.length < maxAlternatives) alternatives.push({ edit, reason })
      else alternativesTruncated = true
    }
    for (const edit of equivalentEdits[index]!) addAlternative(edit, 'same-profile')
    for (let alternative = 0; alternative < profiles.length && !alternativesTruncated; alternative++) {
      if (selected.includes(alternative)) continue
      const replacement = [...selected]
      replacement[i] = alternative
      const attempt = fitSubset(replacement, gram, correlation, y2, m)
      if (attempt.sse <= fit.sse + m * 0.0001) {
        addAlternative(representative[alternative]!, 'similar-fit')
        for (const edit of equivalentEdits[alternative]!) addAlternative(edit, 'similar-fit')
      }
    }
    return { edit: representative[index]!, fraction: fit.weights[i]!, ambiguous: alternatives.length > 0, alternatives, alternativesTruncated }
  }).filter((allele) => allele.fraction >= 0.001).sort((a, b) => b.fraction - a.fraction)
  const fitScore = Math.max(0, 1 - fit.sse / Math.max(y2, 1e-9))
  let rowOffset = 0
  const perRead = reads.map((read, readIndex) => {
    const count = positions[readIndex]!.length
    let error = 0, norm = 0
    for (let row = rowOffset; row < rowOffset + count; row++) {
      for (let base = 0; base < 4; base++) {
        let predicted = 0
        for (let i = 0; i < selected.length; i++) if (profiles[selected[i]!]![row] === base) predicted += fit.weights[i]!
        const observedValue = observed[row]![base]!
        error += (observedValue - predicted) ** 2
        norm += observedValue ** 2
      }
    }
    rowOffset += count
    return { name: read.name, fit: Math.max(0, 1 - error / Math.max(norm, 1e-9)) }
  })
  const warnings: string[] = []
  if (alleles.some((allele) => allele.ambiguous)) warnings.push('Alternative sequences fit the traces similarly; their exact sequences cannot be distinguished.')
  if (fitScore < 0.8) warnings.push('The model fits the peaks poorly; inspect the traces and do not treat its variants as confirmed.')
  if (perRead.some((entry) => entry.fit < 0.8)) warnings.push('At least one read is inconsistent with the shared group model; check grouping and alignment.')
  const considered = [options.localIndels ? 'local indels (deletions up to 50 bp, insertions up to 2 bp, and selected compound edits)' : null, cuts.length === 2 && options.segmentDeletions ? `deletions between guide cuts${options.localIndels ? ' (including selected junction insertions)' : ' (without junction insertions)'}` : null].filter(Boolean)
  warnings.push(`Exploratory model: ${considered.length ? `reference and ${considered.join('; ')}` : 'reference only'}. Excluded edit types cannot be detected. Frequencies are approximate and unvalidated.`)
  return { alleles, fit: fitScore, positions: m, perRead, warnings }
}
