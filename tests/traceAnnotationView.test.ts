import { describe, expect, it } from 'vitest'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import {
  buildTraceAnnotationRecord,
  mapCodonAlignedTemplateSpanToTraceLocations,
  mapTemplateSpanToTraceSpan,
  mapTraceSpanToTemplateSpan,
  remapFeaturesToTrace,
} from '../src/domain/traceAnnotationView'
import { cloneFixture } from '../src/domain/fixtures'

describe('traceAnnotationView', () => {
  it('maps template spans to trace spans through alignment', () => {
    const template = 'AAAAATTTTTGGGGGCCCCCTTTTT'
    const trace = template.slice(5, 20)
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const mapped = mapTemplateSpanToTraceSpan(alignment!, alignment!.templateStart, alignment!.templateEnd)
    expect(mapped).toEqual({ start: 0, end: trace.length })
  })

  it('round-trips selection spans between template and trace coordinates', () => {
    const template = 'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGT'
    const trace = template.slice(10, 30)
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const templateSpan = { start: alignment!.templateStart + 2, end: alignment!.templateStart + 8 }
    const traceSpan = mapTemplateSpanToTraceSpan(alignment!, templateSpan.start, templateSpan.end)
    expect(traceSpan).not.toBeNull()
    const roundTrip = mapTraceSpanToTemplateSpan(alignment!, traceSpan!.start, traceSpan!.end)
    expect(roundTrip).toEqual(templateSpan)
  })

  it('maps codon-aligned spans without including partial codons from inserts', () => {
    const template = 'ATGAAAGGGTTTCCC'
    const trace = 'ATGCCAAGGGTTTCCC'
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const naive = mapTemplateSpanToTraceSpan(alignment!, 3, 12)
    expect(naive).not.toBeNull()
    expect((naive!.end - naive!.start) % 3).not.toBe(0)

    const codonLocations = mapCodonAlignedTemplateSpanToTraceLocations(alignment!, 3, 12)
    expect(codonLocations.length).toBeGreaterThan(0)
    for (const location of codonLocations) {
      expect((location.end - location.start) % 3).toBe(0)
    }
    const remapped = remapFeaturesToTrace(
      [{
        id: 'f1',
        name: 'domain',
        type: 'misc_feature',
        color: '#000',
        locations: [{ start: 3, end: 12, strand: 'forward' }],
      }],
      alignment!,
      { preserveCodons: true },
    )[0]!
    for (const location of remapped.locations) {
      expect((location.end - location.start) % 3).toBe(0)
    }
  })

  it('builds a trace sequence record with remapped features', () => {
    const reference = cloneFixture()
    const traceSequence = reference.sequence.slice(100, 250)
    const alignment = alignTraceToTemplate(traceSequence, reference.sequence)
    expect(alignment).not.toBeNull()
    const traceRecord = buildTraceAnnotationRecord(reference, {
      id: 'trace-1',
      fileName: 'read.ab1',
      sequence: traceSequence,
      chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: traceSequence.split('') },
      enabled: true,
      expanded: true,
      showAnnotations: true,
      alignment,
    })
    expect(traceRecord?.sequence).toBe(traceSequence)
    expect(traceRecord?.features.length).toBeGreaterThan(0)
    traceRecord?.features.forEach((feature) => {
      feature.locations.forEach((location) => {
        expect(location.start).toBeGreaterThanOrEqual(0)
        expect(location.end).toBeLessThanOrEqual(traceSequence.length)
      })
    })
  })
})
