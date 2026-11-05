import { describe, expect, it } from 'vitest'
import { reverseComplement } from '../../domain/sequence'
import type { PrimerBindingLayout } from '../../domain/types'
import { buildPrimerFrameDisplay, refreshExactPrimerBindings, type PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { primer3ThalAlign } from './adapter'
import { displayPrimer3ThalResult, buildPrimer3ThalRequest, formatPrimer3ThalStructure, primerFrameDisplayFromPrimer3Thal } from '../../presentation/primers/primer3ThalForBinding'
import { themeFixturePalette } from '../../test-support/themeFixturePalette'

const conditions = { monoConc: 0.05, mgConc: 0.002, dntpConc: 0.0008, oligoConc: 250e-9 }

function binding(strand: 'forward' | 'reverse', templateStart: number, templateEnd: number): PrimerBindingLayout {
  return { strand, templateStart, templateEnd, components: [{ primerBases: 'ACGTAC', templateStart, templateEnd }] }
}

describe('Primer3 thermodynamic binding request', () => {
  it('receives the full matched region after adding a 5′ tail', async () => {
    let state = 1
    const dna = (length: number) => Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 24) % 4]!
    }).join('')
    const before = dna(80), segment = dna(28), after = dna(80), tail = dna(12)
    const template = before + segment + after
    const sequence = tail + reverseComplement(segment)
    const primer = refreshExactPrimerBindings([{ id: 'p', name: 'Primer', sequence, color: themeFixturePalette.purple }], template)[0]!
    const layout = primer.bindings![0]!
    const request = buildPrimer3ThalRequest({ primer: sequence, template, topology: 'linear', binding: layout, conditions })
    expect(request.status).toBe('ready')
    if (request.status !== 'ready') return
    expect(layout.templateStart).toBeLessThanOrEqual(80)
    expect(layout.templateEnd).toBeGreaterThanOrEqual(108)
    const result = await primer3ThalAlign(request.input)
    const mapped = primerFrameDisplayFromPrimer3Thal({ primer, template, topology: 'linear', binding: layout, input: request.input, result, fallbackDisplay: buildPrimerFrameDisplay(primer, template, layout) })
    expect(mapped).not.toBeNull()
    const indices = new Set(mapped!.display.glyphs.filter((glyph) => glyph.kind === 'annealed').map((glyph) => glyph.templateIndex))
    for (let index = 80; index < 108; index += 1) expect(indices.has(index)).toBe(true)
  })

  it('uses the selected forward or reverse site and opposing strand orientation with explicit units', () => {
    const template = 'TTTTACGTACGGGG'
    const forward = buildPrimer3ThalRequest({
      primer: 'GGACGTAC', template, topology: 'linear', binding: binding('forward', 4, 10), conditions,
    })
    const reverse = buildPrimer3ThalRequest({
      primer: 'GGACGTAC', template, topology: 'linear', binding: binding('reverse', 4, 10), conditions,
    })
    expect(forward.status).toBe('ready')
    expect(reverse.status).toBe('ready')
    if (forward.status !== 'ready' || reverse.status !== 'ready') return
    expect(forward.input.sequence1).toBe('GGACGTAC')
    expect(forward.input.mode).toBe('end1')
    expect(forward.input.sequence2).toBe(reverseComplement(template.slice(4, 10)))
    expect(reverse.input.sequence2).toBe(template.slice(4, 10))
    expect(forward.input.chemistry).toEqual({ mvMmol: 50, dvMmol: 2, dntpMmol: 0.8, dnaNmol: 250 })
  })

  it('wraps only the selected circular site through the origin', () => {
    const template = 'ACGT'.repeat(20)
    const result = buildPrimer3ThalRequest({
      primer: 'ACGTAC', template, topology: 'circular', binding: binding('forward', 78, 5), conditions,
    })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const window = template.slice(78) + template.slice(0, 5)
    expect(result.input.sequence2).toBe(reverseComplement(window))
    expect(result.input.sequence2).toHaveLength(7)
  })

  it('caps wrapped target to the selected interval even for short circular molecules', () => {
    const wrapped = buildPrimer3ThalRequest({
      primer: 'ACGTAC', template: 'ACGT'.repeat(20), topology: 'circular',
      binding: binding('reverse', 78, 5), conditions,
    })
    expect(wrapped.status).toBe('ready')
    if (wrapped.status === 'ready') expect(wrapped.input.sequence2).toHaveLength(7)

    const short = buildPrimer3ThalRequest({
      primer: 'ACGTAC', template: 'ACGTACGTACGTACGT', topology: 'circular',
      binding: binding('reverse', 2, 8), conditions,
    })
    expect(short.status).toBe('ready')
    if (short.status === 'ready') expect(short.input.sequence2).toHaveLength(6)
  })

  it('cannot drift to a nearby stronger site outside the selected binding span', () => {
    const site = 'ACGTAC'
    const selected = binding('forward', 20, 26)
    const weakFlanks = `${'T'.repeat(20)}${site}${'A'.repeat(20)}`
    const strongNearbySite = `${'C'.repeat(20)}${site}${reverseComplement('GCGCGCGC')}${'G'.repeat(12)}`
    const first = buildPrimer3ThalRequest({ primer: site, template: weakFlanks, topology: 'linear', binding: selected, conditions })
    const second = buildPrimer3ThalRequest({ primer: site, template: strongNearbySite, topology: 'linear', binding: selected, conditions })
    expect(first.status).toBe('ready')
    expect(second.status).toBe('ready')
    if (first.status === 'ready' && second.status === 'ready') {
      expect(first.input.sequence2).toBe(reverseComplement(site))
      expect(second.input.sequence2).toBe(first.input.sequence2)
    }
  })

  it('keeps and runs the full long primer when the selected template span is within Primer3 limits', async () => {
    const site = 'ACGT'.repeat(5) + 'A'
    const tail = 'G'.repeat(47)
    const primer = `${tail}${site}`
    const template = `${'T'.repeat(10)}${site}${'C'.repeat(20)}`
    const makeBinding = (strand: 'forward' | 'reverse') => ({
      strand,
      templateStart: 10,
      templateEnd: 31,
      components: [
        { primerBases: tail },
        { primerBases: site, templateStart: 10, templateEnd: 31 },
      ],
    })
    const forward = buildPrimer3ThalRequest({ primer, template, topology: 'linear', binding: makeBinding('forward'), conditions })
    const reverse = buildPrimer3ThalRequest({ primer, template, topology: 'linear', binding: makeBinding('reverse'), conditions })
    expect(forward.status).toBe('ready')
    expect(reverse.status).toBe('ready')
    if (forward.status === 'ready' && reverse.status === 'ready') {
      expect(forward.input.sequence1).toBe(primer)
      expect(reverse.input.sequence1).toBe(primer)
      expect(forward.approximation).toBeUndefined()
      expect(reverse.approximation).toBeUndefined()
      expect(forward.input.sequence2).toHaveLength(21)
      const native = await primer3ThalAlign(forward.input)
      expect(native.alignEnd1).toBe(primer.length)
      expect(native.structure).toContain(primer)
    }
  })

  it('trims only a provable leading 5′ tail when both inputs exceed 60 nt', async () => {
    const target = 'ACCTTTTTGCCGTCCTAATGTGTTCGCTGCGAATTCCATTGGCTGTCGTGATCGCCATAAGCATAGCGGA'
    const tail = 'T'.repeat(10)
    const template = `${'A'.repeat(5)}${target}${'C'.repeat(5)}`

    for (const strand of ['forward', 'reverse'] as const) {
      const annealed = strand === 'forward'
        ? target.slice(0, 29) + target.slice(41)
        : reverseComplement(target.slice(41)) + reverseComplement(target.slice(0, 29))
      const primer = tail + annealed
      const makeBinding = () => ({
        strand,
        templateStart: 5,
        templateEnd: 75,
        components: strand === 'forward'
          ? [
            { primerBases: tail },
            { primerBases: annealed.slice(0, 29), templateStart: 5, templateEnd: 34 },
            { primerBases: annealed.slice(29), templateStart: 46, templateEnd: 75 },
          ]
          : [
            { primerBases: tail },
            { primerBases: annealed.slice(0, 29), templateStart: 46, templateEnd: 75 },
            { primerBases: annealed.slice(29), templateStart: 5, templateEnd: 34 },
          ],
      })
      const request = buildPrimer3ThalRequest({
        primer, template, topology: 'linear', binding: makeBinding(), conditions,
      })
      expect(request.status).toBe('ready')
      if (request.status !== 'ready') continue
      expect(request.input.sequence1).toBe(primer.slice(8))
      expect(request.input.sequence1).toHaveLength(60)
      expect(request.input.sequence2).toHaveLength(70)
      expect(request.input.sequence2).toBe(strand === 'forward' ? reverseComplement(target) : target)
      expect(request.approximation).toEqual({
        excludedPrimer5PrimeBases: 'T'.repeat(8),
        excludedPrimer5PrimeBaseCount: 8,
        retainedPrimer5PrimeBaseCount: 2,
        fullPrimerLength: 68,
        modeledPrimerLength: 60,
      })
      if (!request.approximation) throw new Error('Expected long-primer approximation')
      if (strand === 'forward') {
        const native = await primer3ThalAlign(request.input)
        expect(native.alignEnd1).toBe(60)
        const fallbackDisplay: PrimerFrameDisplay = {
          primerId: 'long-primer', name: 'long primer', color: 'primer-color', strand,
          sequence: primer, glyphs: [], templateSpanStart: 5, templateSpanEnd: 75,
          selectRange: { start: 5, end: 75 },
        }
        const mapped = primerFrameDisplayFromPrimer3Thal({
          primer: { id: 'long-primer', name: 'long primer', color: 'primer-color', sequence: primer },
          template, topology: 'linear', binding: makeBinding(), input: request.input, result: native,
          excludedPrimer5PrimeBases: request.approximation.excludedPrimer5PrimeBases,
          fallbackDisplay,
        })
        expect(mapped?.display.sequence).toBe(primer)
        expect(mapped?.display.glyphs.slice(0, 8).map((glyph) => glyph.char).join('')).toBe('T'.repeat(8))
        expect(mapped?.display.glyphs.slice(0, 8).every((glyph) => glyph.kind === 'overhang')).toBe(true)
      }
    }
  })

  it('does not trim annealed/internal/3′ bases when the long inputs cannot be reduced safely', () => {
    const target = 'ACGT'.repeat(17) + 'AC'
    const template = `${'A'.repeat(5)}${target}${'C'.repeat(5)}`
    const primer = 'G'.repeat(61)
    const baseArgs = { primer, template, topology: 'linear' as const, conditions }
    const annealedTooLong = buildPrimer3ThalRequest({
      ...baseArgs,
      binding: { strand: 'forward', templateStart: 5, templateEnd: 75, components: [{ primerBases: primer, templateStart: 5, templateEnd: 75 }] },
    })
    const internalUnpaired = buildPrimer3ThalRequest({
      ...baseArgs,
      binding: {
        strand: 'forward', templateStart: 5, templateEnd: 75,
        components: [
          { primerBases: primer.slice(0, 20), templateStart: 5, templateEnd: 25 },
          { primerBases: primer[20]! },
          { primerBases: primer.slice(21), templateStart: 25, templateEnd: 75 },
        ],
      },
    })
    const threePrimeTail = buildPrimer3ThalRequest({
      ...baseArgs,
      binding: {
        strand: 'forward', templateStart: 5, templateEnd: 75,
        components: [
          { primerBases: primer.slice(0, 60), templateStart: 5, templateEnd: 65 },
          { primerBases: primer.slice(60) },
        ],
      },
    })
    expect(annealedTooLong).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('annealed primer region') })
    expect(internalUnpaired).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('internal unpaired') })
    expect(threePrimeTail).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('internal unpaired') })
  })

  it('reports unsupported primer bases, length, site, and conditions instead of creating a request', () => {
    const args = { template: 'ACGT'.repeat(40), topology: 'linear' as const, binding: binding('forward', 20, 26), conditions }
    expect(buildPrimer3ThalRequest({ ...args, primer: 'ACGTN' })).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('unambiguous') })
    expect(buildPrimer3ThalRequest({ ...args, template: `${'A'.repeat(20)}N${'C'.repeat(59)}`, primer: 'ACGT' })).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('template window') })
    expect(buildPrimer3ThalRequest({ ...args, primer: 'A'.repeat(61), binding: undefined }))
      .toMatchObject({ status: 'unavailable', reason: expect.stringContaining('binding site') })
    expect(buildPrimer3ThalRequest({ ...args, primer: 'ACGT', conditions: null })).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('conditions') })
    expect(buildPrimer3ThalRequest({ ...args, primer: 'ACGT', binding: undefined })).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('binding site') })
    expect(buildPrimer3ThalRequest({ ...args, primer: 'ACGT', conditions: { monoConc: 0, mgConc: 0, dntpConc: 0, oligoConc: 250e-9 } }))
      .toMatchObject({ status: 'unavailable', reason: expect.stringContaining('salt or Mg') })
  })

  it('suppresses sentinel and no-alignment Tm values', () => {
    expect(displayPrimer3ThalResult({ tmC: -289, alignEnd1: 8, alignEnd2: 2, structure: 'drawing', mode: 'end1' }))
      .toMatchObject({ status: 'unavailable', reason: expect.stringContaining('No stable') })
    expect(displayPrimer3ThalResult({ tmC: 0, alignEnd1: -1, alignEnd2: -1, structure: '', mode: 'any' }))
      .toMatchObject({ status: 'unavailable', reason: expect.stringContaining('No stable') })
  })

  it('formats native literal line separators and degree entities as safe plain text', () => {
    expect(formatPrimer3ThalStructure('Tm: 50&deg;C\\n5\' ACGT 3\\n ||||')).toBe('Tm: 50°C\n5\' ACGT 3\n ||||')
  })
})

describe('Primer3 structure to primer display conversion', () => {
  const sequence = 'AACCGGTA'
  const primer = { id: 'p1', name: 'primer', sequence, color: 'primer-color' }
  const display: PrimerFrameDisplay = {
    primerId: 'p1', name: 'primer', color: 'primer-color', strand: 'forward', sequence,
    glyphs: [], templateSpanStart: 0, templateSpanEnd: 8, selectRange: { start: 0, end: 8 },
  }

  it('maps full forward and reverse duplexes by sequence coordinates', async () => {
    const forwardInput = { sequence1: sequence, sequence2: reverseComplement(sequence), mode: 'end1' as const }
    const forwardResult = await primer3ThalAlign(forwardInput)
    const forward = primerFrameDisplayFromPrimer3Thal({
      primer, template: sequence, topology: 'linear', binding: binding('forward', 0, 8),
      input: forwardInput, result: forwardResult, fallbackDisplay: display,
    })
    expect(forward?.layout.components).toEqual([{ primerBases: sequence, templateStart: 0, templateEnd: 8 }])
    expect(forward?.display.glyphs.map((glyph) => glyph.templateIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])

    const reversePrimer = reverseComplement(sequence)
    const reverseInput = { sequence1: reversePrimer, sequence2: sequence, mode: 'end1' as const }
    const reverseResult = await primer3ThalAlign(reverseInput)
    const reverse = primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: reversePrimer }, template: sequence, topology: 'linear', binding: binding('reverse', 0, 8),
      input: reverseInput, result: reverseResult,
      fallbackDisplay: { ...display, strand: 'reverse', sequence: reversePrimer },
    })
    expect(reverse?.display.glyphs.map((glyph) => glyph.templateIndex)).toEqual([7, 6, 5, 4, 3, 2, 1, 0])
  })

  it('shows mismatches and primer bulges from base columns, not from THAL bars', async () => {
    const mismatchPrimer = 'AATCGGTA'
    const mismatchInput = { sequence1: mismatchPrimer, sequence2: reverseComplement(sequence), mode: 'end1' as const }
    const mismatchResult = await primer3ThalAlign(mismatchInput)
    const mismatch = primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: mismatchPrimer }, template: sequence, topology: 'linear', binding: binding('forward', 0, 8),
      input: mismatchInput, result: mismatchResult, fallbackDisplay: { ...display, sequence: mismatchPrimer },
    })
    expect(mismatch?.display.glyphs.filter((glyph) => glyph.kind === 'mismatch')).toHaveLength(1)

    const insertedPrimer = 'AACCAAGGTA'
    const insertionInput = { sequence1: insertedPrimer, sequence2: reverseComplement(sequence), mode: 'end1' as const }
    const insertionResult = await primer3ThalAlign(insertionInput)
    const insertion = primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: insertedPrimer }, template: sequence, topology: 'linear', binding: binding('forward', 0, 8),
      input: insertionInput, result: insertionResult, fallbackDisplay: { ...display, sequence: insertedPrimer },
    })
    expect(insertion?.display.glyphs.filter((glyph) => glyph.kind === 'overhang')).toHaveLength(2)
    expect(insertion?.display.glyphs.filter((glyph) => glyph.kind === 'overhang').map((glyph) => glyph.row)).toEqual([1, 1])

    const longerTemplate = 'ACGTAAACGTACGT'
    const shorterPrimer = 'ACGTACGTACGT'
    const targetInsertionInput = { sequence1: shorterPrimer, sequence2: reverseComplement(longerTemplate), mode: 'end1' as const }
    const targetInsertionResult = await primer3ThalAlign(targetInsertionInput)
    const targetInsertion = primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: shorterPrimer }, template: longerTemplate, topology: 'linear',
      binding: binding('forward', 0, longerTemplate.length), input: targetInsertionInput, result: targetInsertionResult,
      fallbackDisplay: { ...display, sequence: shorterPrimer, templateSpanEnd: longerTemplate.length, selectRange: { start: 0, end: longerTemplate.length } },
    })
    expect(targetInsertion?.display.glyphs.filter((glyph) => glyph.kind === 'template-gap')).toHaveLength(2)
  })

  it('maps a 5′ tail and circular wrap, while rejecting partial target context', async () => {
    const tailPrimer = `GGG${sequence}`
    const tailInput = { sequence1: tailPrimer, sequence2: reverseComplement(sequence), mode: 'end1' as const }
    const tailResult = await primer3ThalAlign(tailInput)
    const tail = primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: tailPrimer }, template: sequence, topology: 'linear', binding: binding('forward', 0, 8),
      input: tailInput, result: tailResult, fallbackDisplay: { ...display, sequence: tailPrimer },
    })
    expect(tail?.display.glyphs.slice(0, 3).map((glyph) => glyph.kind)).toEqual(['overhang', 'overhang', 'overhang'])

    const circular = 'CCCAACCGGT'
    const wrappedSite = 'GTCCC'
    const wrappedInput = { sequence1: wrappedSite, sequence2: reverseComplement(wrappedSite), mode: 'end1' as const }
    const wrappedResult = await primer3ThalAlign(wrappedInput)
    const wrapped = primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: wrappedSite }, template: circular, topology: 'circular', binding: binding('forward', 8, 3),
      input: wrappedInput, result: wrappedResult,
      fallbackDisplay: { ...display, sequence: wrappedSite, selectRange: { start: 8, end: 3 } },
    })
    expect(wrapped?.display.glyphs.map((glyph) => glyph.templateIndex)).toEqual([8, 9, 0, 1, 2])

    const reversePrimer = reverseComplement(sequence)
    const reverseInput = { sequence1: reversePrimer, sequence2: sequence, mode: 'end1' as const }
    const reverseResult = await primer3ThalAlign(reverseInput)
    const partial = { ...reverseResult, structure: reverseResult.structure.replace("3' ATGGCCAA 5'", "3' ATGGCC 5'") }
    expect(primerFrameDisplayFromPrimer3Thal({
      primer: { ...primer, sequence: reversePrimer }, template: sequence, topology: 'linear', binding: binding('reverse', 0, 8),
      input: reverseInput, result: partial, fallbackDisplay: { ...display, sequence: reversePrimer, strand: 'reverse' },
    })).toBeNull()

    const terminalMismatchSite = reverseComplement('GACCGGTT')
    const terminalMismatchInput = { sequence1: sequence, sequence2: 'GACCGGTT', mode: 'end1' as const }
    const terminalMismatchResult = await primer3ThalAlign(terminalMismatchInput)
    expect(primerFrameDisplayFromPrimer3Thal({
      primer, template: terminalMismatchSite, topology: 'linear', binding: binding('forward', 0, 8),
      input: terminalMismatchInput, result: terminalMismatchResult,
      fallbackDisplay: { ...display },
    })).toBeNull()
  })

  it('round-trips a full 200-nt primer against a 60-nt target without truncating native structure', async () => {
    const target = 'ACGT'.repeat(15)
    const leadingTail = 'T'.repeat(140)
    const fullPrimer = `${leadingTail}${target}`
    const input = { sequence1: fullPrimer, sequence2: reverseComplement(target), mode: 'end1' as const }
    const result = await primer3ThalAlign(input)
    expect(result.alignEnd1).toBe(200)
    expect(result.structure).toContain(fullPrimer)
    expect(result.structure.length).toBeGreaterThan(300)

    const fullPrimerFrame = {
      ...primer,
      sequence: fullPrimer,
    }
    const converted = primerFrameDisplayFromPrimer3Thal({
      primer: fullPrimerFrame,
      template: target,
      topology: 'linear',
      binding: {
        strand: 'forward', templateStart: 0, templateEnd: 60,
        components: [
          { primerBases: leadingTail },
          { primerBases: target, templateStart: 0, templateEnd: 60 },
        ],
      },
      input,
      result,
      fallbackDisplay: { ...display, sequence: fullPrimer, templateSpanEnd: 60, selectRange: { start: 0, end: 60 } },
    })
    expect(converted?.display.sequence).toBe(fullPrimer)
    expect(converted?.display.glyphs.filter((glyph) => glyph.kind === 'overhang')).toHaveLength(140)
    expect(converted?.display.glyphs.filter((glyph) => glyph.kind === 'annealed')).toHaveLength(60)
  })

  it('keeps native structure intact beyond the former 30-kB output buffer', async () => {
    const target = 'G'.repeat(60)
    const primer = `${'A'.repeat(9940)}${target}`
    const result = await primer3ThalAlign({
      sequence1: primer,
      sequence2: reverseComplement(target),
      mode: 'end1',
    })
    expect(result.alignEnd1).toBe(10_000)
    expect(result.structure).toContain(primer)
    expect(result.structure.length).toBeGreaterThan(30_000)
  })
})
