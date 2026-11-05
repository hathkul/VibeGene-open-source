import { describe, expect, it } from 'vitest'
import { reverseComplement } from '../sequence'
import type { TraceFileRecord, TraceTemplateAlignment } from '../traceTypes'
import { prepareEvidenceTrace } from './peaks'
import { candidateEdits, fitAlleles } from './fit'

function dna(n: number) { let x = 13, text = ''; for (let i = 0; i < n; i++) { x = (x * 1664525 + 1013904223) >>> 0; text += 'ACGT'[(x >>> 16) & 3] }; return text }
function trace(reference: string, edited: string, fraction: number, reverse = false): TraceFileRecord {
  const ref = reverse ? reverseComplement(reference) : reference
  const alt = reverse ? reverseComplement(edited) : edited
  const length = Math.min(350, ref.length, alt.length)
  const channels = Object.fromEntries('ACGT'.split('').map((base) => [base, Array(length * 10 + 10).fill(0)])) as Record<string, number[]>
  const calls: string[] = []
  for (let i = 0; i < length; i++) {
    channels[ref[i]!]![i * 10 + 5] += (1 - fraction) * 1000
    channels[alt[i]!]![i * 10 + 5] += fraction * 1000
    calls.push(ref[i]!)
  }
  const columns: TraceTemplateAlignment['columns'] = Array.from({ length }, (_, traceIndex) => ({ kind: 'match', templateIndex: reverse ? reference.length - 1 - traceIndex : traceIndex, traceIndex, match: true }))
  return { id: reverse ? 'r' : 'f', fileName: 'sample.ab1', sequence: calls.join(''), enabled: true, expanded: false, showAnnotations: false,
    chromatogram: { aTrace: channels.A!, cTrace: channels.C!, gTrace: channels.G!, tTrace: channels.T!, basePos: calls.map((_, i) => i * 10 + 5), baseCalls: calls },
    alignment: { templateStart: 0, templateEnd: length, traceStart: 0, traceEnd: length, mismatchCount: 0, gapCount: 0, alignmentScore: 100, orientation: reverse ? 'reverse' : 'forward', columns } }
}

describe('chromatogram allele inference', () => {
  it('fits a mixture of the reference and a cut-site deletion from peak channels', () => {
    const ref = dna(500)
    const alt = ref.slice(0, 200) + ref.slice(203)
    const evidence = prepareEvidenceTrace(ref, [200], trace(ref, alt, 0.4))
    const result = fitAlleles(ref, [200], [evidence])
    expect(result.fit).toBeGreaterThan(0.95)
    expect(result.alleles.some(({ edit }) => edit.label === 'Reference')).toBe(true)
    expect(result.alleles.some(({ edit }) => edit.end - edit.start === 3)).toBe(true)
    expect(result.alleles[0]!.fraction).toBeCloseTo(0.6, 1)
  })

  it('rejects edited or missing chromatogram channels', () => {
    const ref = dna(500)
    const item = trace(ref, ref, 0)
    expect(() => prepareEvidenceTrace(ref, [200], { ...item, sequenceEdited: true })).toThrow(/unedited chromatogram/)
    expect(() => prepareEvidenceTrace(ref, [200], { ...item, chromatogram: { ...item.chromatogram, aTrace: [] } })).toThrow(/chromatogram/)
  })

  it('jointly fits independent forward and reverse chromatograms', () => {
    const ref = dna(500)
    const alt = ref.slice(0, 200) + ref.slice(203)
    const reads = [trace(ref, alt, 0.4), trace(ref, alt, 0.4, true)]
      .map((item) => prepareEvidenceTrace(ref, [200], item))
    const result = fitAlleles(ref, [200], reads)
    expect(result.fit).toBeGreaterThan(0.95)
    expect(result.alleles.some(({ edit }) => edit.end - edit.start === 3)).toBe(true)
    expect(result.alleles[0]!.fraction).toBeCloseTo(0.6, 1)
  })

  it('finds a deletion between two guide cuts', () => {
    const ref = dna(500)
    const alt = ref.slice(0, 150) + ref.slice(260)
    const evidence = prepareEvidenceTrace(ref, [150, 260], trace(ref, alt, 0.45))
    const result = fitAlleles(ref, [150, 260], [evidence])
    expect(result.fit).toBeGreaterThan(0.95)
    expect(result.alleles.some(({ edit }) => ref.slice(0, edit.start) + edit.inserted + ref.slice(edit.end) === alt)).toBe(true)
  })

  it('restricts candidates before fitting and keeps the reference in every mode', () => {
    const ref = dna(500)
    // Nearby cuts also allow a local-deletion enumeration to span both cuts.
    const cuts = [200, 220]
    const segments = candidateEdits(ref, cuts, { localIndels: false, segmentDeletions: true })
    const locals = candidateEdits(ref, cuts, { localIndels: true, segmentDeletions: false })
    const referenceOnly = candidateEdits(ref, cuts, { localIndels: false, segmentDeletions: false })
    expect(segments.some((edit) => edit.label.startsWith('Segment deletion'))).toBe(true)
    expect(segments.every((edit) => edit.label === 'Reference' || edit.label.startsWith('Segment deletion'))).toBe(true)
    expect(segments.every((edit) => edit.inserted === '')).toBe(true)
    expect(locals.some((edit) => edit.label.startsWith('Local indel'))).toBe(true)
    expect(locals.every((edit) => edit.label === 'Reference' || edit.label.startsWith('Local indel'))).toBe(true)
    expect(referenceOnly.map((edit) => edit.label)).toEqual(['Reference'])
    expect(candidateEdits(ref, [200], { localIndels: false, segmentDeletions: true }).map((edit) => edit.label)).toEqual(['Reference'])
  })

  it('fits only allowed edit types and reports the model scope', () => {
    const ref = dna(500)
    const alt = ref.slice(0, 150) + ref.slice(260)
    const evidence = prepareEvidenceTrace(ref, [150, 260], trace(ref, alt, 0.45))
    const result = fitAlleles(ref, [150, 260], [evidence], { localIndels: false, segmentDeletions: true })
    expect(result.alleles.some(({ edit }) => edit.label.startsWith('Segment deletion'))).toBe(true)
    expect(result.alleles.every(({ edit }) => edit.label === 'Reference' || edit.label.startsWith('Segment deletion'))).toBe(true)
    expect(result.warnings.join(' ')).toContain('Excluded edit types cannot be detected')
    const referenceOnly = fitAlleles(ref, [150, 260], [evidence], { localIndels: false, segmentDeletions: false })
    expect(referenceOnly.alleles.map(({ edit }) => edit.label)).toEqual(['Reference'])
    expect(referenceOnly.warnings.join(' ')).toContain('reference only')
  })

  it('resolves a one-base insertion when its junction is covered', () => {
    const ref = dna(500)
    const alt = ref.slice(0, 200) + 'G' + ref.slice(200)
    const evidence = prepareEvidenceTrace(ref, [200], trace(ref, alt, 0.35))
    const result = fitAlleles(ref, [200], [evidence])
    expect(result.fit).toBeGreaterThan(0.95)
    expect(result.alleles.some(({ edit }) => ref.slice(0, edit.start) + edit.inserted + ref.slice(edit.end) === alt)).toBe(true)
  })

  it('flags unresolved candidates when different edits have identical observed peak profiles', () => {
    const ref = dna(500)
    const alt = ref.slice(0, 170) + ref.slice(200)
    const evidence = prepareEvidenceTrace(ref, [200], trace(ref, alt, 0.5))
    for (let i = evidence.anchorTrace + 1; i < 208; i++) evidence.peaks[i] = [0, 0, 0, 0]
    const result = fitAlleles(ref, [200], [evidence])
    expect(result.alleles.some((allele) => allele.ambiguous)).toBe(true)
    for (const allele of result.alleles) {
      expect(allele.ambiguous).toBe(allele.alternatives.length > 0)
      for (const alternative of allele.alternatives) {
        expect(alternative.edit).not.toEqual(allele.edit)
        expect(['same-profile', 'similar-fit']).toContain(alternative.reason)
        expect(candidateEdits(ref, [200])).toContainEqual(alternative.edit)
      }
    }
    expect(result.alleles.flatMap((allele) => allele.alternatives).some((alternative) => alternative.reason === 'same-profile')).toBe(true)
    expect(result.warnings.join(' ')).toContain('cannot be distinguished')
  })
})
