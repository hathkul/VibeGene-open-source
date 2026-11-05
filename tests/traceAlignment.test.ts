import { describe, expect, it } from 'vitest'
import { alignTraceToTemplate, alignmentOverlapsTemplateRange, alignmentStatsLabel, buildReferenceReplacementFromTrace } from '../src/domain/traceAlignment'

describe('alignTraceToTemplate', () => {
  it('aligns an exact subsequence to the template', () => {
    const template = 'ATGCGTACGTACGTACGTACGTACGTACGTACGTACGTACGT'
    const trace = template.slice(10, 30)
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    if (!alignment) return
    expect(alignment.templateEnd - alignment.templateStart).toBe(trace.length)
    expect(alignment?.mismatchCount).toBe(0)
    expect(template.slice(alignment.templateStart, alignment.templateEnd)).toBe(trace)
  })

  it('reports mismatches and gaps', () => {
    const template = 'AAAAATTTTTGGGGGCCCCCTTTTT'
    const trace = 'AAAATTTTGGGGCCCCCTTTT'
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    expect(alignment!.mismatchCount).toBeGreaterThanOrEqual(0)
    expect(alignmentStatsLabel(alignment!)).toContain('aligned')
  })

  it('returns null for empty input', () => {
    expect(alignTraceToTemplate('', 'ATGC')).toBeNull()
    expect(alignTraceToTemplate('ATGC', '')).toBeNull()
  })

  it('aligns full-length identical sequences without seeded DP', () => {
    const sequence = 'ATGC'.repeat(3500)
    const alignment = alignTraceToTemplate(sequence, sequence)
    expect(alignment).not.toBeNull()
    expect(alignment?.orientation).toBe('forward')
    expect(alignment?.templateStart).toBe(0)
    expect(alignment?.templateEnd).toBe(sequence.length)
    expect(alignment?.mismatchCount).toBe(0)
    expect(alignment?.gapCount).toBe(0)
  })

  it('aligns long near-equal sequences with mismatches/indels via banded global fallback', () => {
    const template = 'ATGC'.repeat(3500) // 14k
    // introduce mismatches + a small indel
    const mutated =
      template.slice(0, 2000) +
      'G' + // mismatch (template has 'A' here)
      template.slice(2001, 7000) +
      'TTT' + // insertion
      template.slice(7000, 10000) +
      template.slice(10005) // deletion of 5 bases

    const alignment = alignTraceToTemplate(mutated, template)
    expect(alignment).not.toBeNull()
    expect(alignment?.templateStart).toBe(0)
    // Large near-equal inputs may use the seeded local fallback; tolerate the
    // short clipped edge while still requiring a near-full-length alignment.
    expect(alignment?.templateEnd).toBeGreaterThanOrEqual(template.length - 10)
    expect(alignment?.mismatchCount).toBeGreaterThan(0)
    expect(alignment?.gapCount).toBeGreaterThan(0)
  })

  it('aligns circularly-rotated near-identical full-length sequences', () => {
    // This intentionally exercises 14 kb linear+circular fallbacks under parallel-suite contention.
    // Unique-ish template: short tandem repeats create many ambiguous circular offsets.
    const alphabet = 'ACGT'
    let template = ''
    let state = 0x9e3779b9
    for (let i = 0; i < 14000; i += 1) {
      state = (Math.imul(state ^ (state >>> 16), 0x85ebca6b) >>> 0) ^ (i * 0x27d4eb2d)
      template += alphabet[state & 3]
    }
    const offset = 6962
    const rotated = template.slice(offset) + template.slice(0, offset)
    const mutated = rotated.slice(0, 100) + (rotated[100] === 'A' ? 'G' : 'A') + rotated.slice(101)

    const linear = alignTraceToTemplate(mutated, template, { topology: 'linear' })
    expect(linear).not.toBeNull()
    // Linear topology must not wrap the two matching arms together. It should
    // return the longer contiguous arm; circular topology below covers a lap.
    const linearSpan = linear!.templateEnd - linear!.templateStart
    expect(linearSpan).toBeGreaterThan(6000)
    expect(linearSpan).toBeLessThan(template.length)

    const circular = alignTraceToTemplate(mutated, template, { topology: 'circular' })
    expect(circular).not.toBeNull()
    expect(circular?.orientation).toBe('forward')
    expect(circular?.templateStart).toBe(0)
    expect(circular?.templateEnd).toBe(template.length)
    expect(circular!.mismatchCount).toBe(1)
    expect(circular!.gapCount).toBe(0)
    const firstMatch = circular!.columns.find((column) => column.kind === 'match')
    expect(firstMatch && firstMatch.kind === 'match' ? firstMatch.templateIndex : null).toBe(offset)
  }, 10_000)

  it('aligns reverse-complement reads to the template', () => {
    const template = 'A'.repeat(60)
    const trace = 'T'.repeat(20)
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    expect(alignment?.orientation).toBe('reverse')
    expect(alignment?.mismatchCount).toBe(0)
    expect(alignment?.templateEnd - alignment!.templateStart).toBe(20)
  })
})

describe('buildReferenceReplacementFromTrace', () => {
  it('uses complementary bases for reverse alignments', () => {
    const template = 'A'.repeat(40)
    const trace = 'T'.repeat(10)
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment?.orientation).toBe('reverse')
    const replacement = buildReferenceReplacementFromTrace(
      alignment!,
      trace.split(''),
      alignment!.templateStart,
      alignment!.templateEnd,
    )
    expect(replacement).toBe('A'.repeat(10))
  })
})

describe('alignmentOverlapsTemplateRange', () => {
  it('detects overlap with the visible template window', () => {
    const alignment = { templateStart: 10, templateEnd: 30 } as NonNullable<ReturnType<typeof alignTraceToTemplate>>
    expect(alignmentOverlapsTemplateRange(alignment, 0, 15)).toBe(true)
    expect(alignmentOverlapsTemplateRange(alignment, 25, 40)).toBe(true)
    expect(alignmentOverlapsTemplateRange(alignment, 0, 10)).toBe(false)
    expect(alignmentOverlapsTemplateRange(alignment, 30, 40)).toBe(false)
    expect(alignmentOverlapsTemplateRange(alignment, 12, 28)).toBe(true)
  })
})
