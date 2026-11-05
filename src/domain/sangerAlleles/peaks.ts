import { reverseComplement } from '../sequence'
import type { TraceFileRecord } from '../traceTypes'

export const BASES = 'ACGT'
export type PeakVector = [number, number, number, number]
export type EvidenceTrace = { name: string; orientation: 'forward' | 'reverse'; anchorReference: number; anchorTrace: number; cut: number; peaks: PeakVector[]; onset: number | null; reference: string }

/** Sample the local maximum in each channel within the base caller's local interval. */
export function extractPeakVectors(trace: TraceFileRecord): PeakVector[] {
  const c = trace.chromatogram
  const arrays = [c.aTrace, c.cTrace, c.gTrace, c.tTrace]
  const n = Math.min(...arrays.map((a) => a.length))
  if (trace.sequenceEdited || trace.parseError || !n || c.basePos.length < 30 || c.baseCalls.length !== c.basePos.length) throw new Error(`${trace.fileName}: a usable, unedited chromatogram with base positions is required.`)
  if (c.basePos.some((value, index) => !Number.isFinite(value) || value < 0 || value >= n || (index > 0 && value <= c.basePos[index - 1]!))) throw new Error(`${trace.fileName}: chromatogram base positions are invalid.`)
  return c.basePos.map((pos, i) => {
    const spacingLeft = i ? pos - c.basePos[i - 1]! : (c.basePos[1]! - pos)
    const spacingRight = i + 1 < c.basePos.length ? c.basePos[i + 1]! - pos : spacingLeft
    const radius = Math.max(1, Math.floor(Math.min(spacingLeft, spacingRight) * 0.32))
    const start = Math.max(0, Math.ceil(pos - radius))
    const end = Math.min(n - 1, Math.floor(pos + radius))
    const peaks = arrays.map((a) => {
      let best = 0
      for (let p = start; p <= end; p++) best = Math.max(best, a[p] ?? 0)
      return best
    })
    const sum = peaks.reduce((a, b) => a + b, 0)
    return (sum > 0 ? peaks.map((value) => value / sum) : [0, 0, 0, 0]) as PeakVector
  })
}

/** Locate a consecutive exact-match anchor upstream of the first cut in read direction. */
export function prepareEvidenceTrace(reference: string, cuts: readonly number[], trace: TraceFileRecord): EvidenceTrace {
  const alignment = trace.alignment
  if (!alignment) throw new Error(`${trace.fileName}: align the trace to this reference first.`)
  const peaks = extractPeakVectors(trace)
  const reverse = alignment.orientation === 'reverse'
  const orientedReference = reverse ? reverseComplement(reference) : reference
  const cut = Math.min(...cuts.map((value) => reverse ? reference.length - value : value))
  const aligned = alignment.columns.filter((column) => column.kind === 'match' && column.match).map((column) => {
    if (column.kind !== 'match') throw new Error('Unexpected alignment column.')
    return { reference: reverse ? reference.length - 1 - column.templateIndex : column.templateIndex, trace: column.traceIndex }
  }).filter((entry) => entry.reference >= 0 && entry.reference < cut && entry.trace >= 0 && entry.trace < peaks.length)
    .sort((a, b) => a.reference - b.reference)
  let run = 0
  let best: { reference: number; trace: number } | null = null
  for (let i = 0; i < aligned.length; i++) {
    const entry = aligned[i]!
    const previous = aligned[i - 1]
    const called = trace.chromatogram.baseCalls[entry.trace]?.toUpperCase()
    const correct = called === orientedReference[entry.reference]
    const quality = trace.chromatogram.qualNums?.[entry.trace]
    const usable = correct && (quality === undefined || quality >= 15) && peaks[entry.trace]!.reduce((a, b) => a + b, 0) > 0
    run = usable ? (previous && entry.reference === previous.reference + 1 && entry.trace === previous.trace + 1 ? run + 1 : 1) : 0
    if (!best && run >= 10 && cut - entry.reference <= 90 && cut - entry.reference >= 8) best = entry
  }
  if (!best) throw new Error(`${trace.fileName}: no reliable 10-base reference anchor was found before the cut in the read direction.`)
  const cutTrace = best.trace + cut - best.reference
  if (cutTrace < 0 || cutTrace + 30 > peaks.length) throw new Error(`${trace.fileName}: insufficient chromatogram coverage after the expected cut.`)
  const start = Math.max(0, cutTrace - 8)
  let onset: number | null = null
  for (let i = start; i + 5 < Math.min(peaks.length, cutTrace + 50); i++) {
    let mixed = 0
    for (let j = 0; j < 6; j++) {
      const sorted = [...peaks[i + j]!].sort((a, b) => b - a)
      if (sorted[0]! >= 0.1 && sorted[1]! / sorted[0]! >= 0.24) mixed++
    }
    if (mixed >= 4) { onset = i; break }
  }
  return { name: trace.fileName, orientation: alignment.orientation, anchorReference: best.reference, anchorTrace: best.trace, cut, peaks, onset, reference: orientedReference }
}
