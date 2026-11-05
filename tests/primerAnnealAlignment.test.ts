import { describe, expect, it } from 'vitest'
import { reverseComplement } from '../src/domain/sequence'
import { alignPrimerToTemplate, resolvePrimerBindingLayouts } from '../src/domain/primerAnnealAlignment'
import { annealMaskFromBindingLayout } from '../src/domain/primerBindingAnalysis'
import { refreshExactPrimerBindings } from '../src/domain/primerBindingPolicy'

describe('primerAnnealAlignment', () => {
  it.each(['forward', 'reverse'] as const)('keeps a long matched 3′ region when a 5′ tail is added on the %s strand', (strand) => {
    let state = 1
    const dna = (length: number) => Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 24) % 4]!
    }).join('')
    const before = dna(80)
    const segment = dna(28)
    const after = dna(80)
    const tail = dna(12)
    const template = before + segment + after
    const annealed = strand === 'forward' ? segment : reverseComplement(segment)
    const query = tail + annealed
    const original = refreshExactPrimerBindings([{ id: 'p', name: 'primer', sequence: annealed, color: '#000' }], template)[0]!
    expect(original.bindings?.some((layout) => annealMaskFromBindingLayout(template, annealed, layout).every(Boolean))).toBe(true)
    const updated = refreshExactPrimerBindings([{ ...original, sequence: query }], template)[0]!
    expect(updated.bindings?.some((layout) => annealMaskFromBindingLayout(template, query, layout).slice(-annealed.length).every(Boolean))).toBe(true)
  })

  it('anneals a fully matching forward primer', () => {
    const template = `${'A'.repeat(20)}GACCACCATGTCAACGTTGG${'A'.repeat(20)}`
    const result = alignPrimerToTemplate(template, 'GACCACCATGTCAACGTTGG', 'forward')
    expect(result).not.toBeNull()
    expect(result!.layout.templateStart).toBe(20)
    expect(result!.layout.templateEnd).toBe(40)
    expect(result!.mask.every(Boolean)).toBe(true)
    expect(result!.layout.components).toHaveLength(1)
    expect(result!.layout.components[0]).toMatchObject({ templateStart: 20, templateEnd: 40 })
  })

  it('keeps an isolated internal mismatch inside the annealed duplex', () => {
    // Primer matches template except a single internal base.
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `${'T'.repeat(15)}${annealed}${'T'.repeat(15)}`
    const primer = 'GACCACGATGTCAACGTTGG' // position 6 (C->G) is a mismatch
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    // Single contiguous annealed component spanning the whole duplex (mismatch included).
    expect(result!.layout.components).toHaveLength(1)
    expect(result!.layout.components[0]).toMatchObject({ templateStart: 15, templateEnd: 35 })
    // The mismatch base is part of the duplex region but not counted as a paired base.
    expect(result!.mask[6]).toBe(false)
    expect(result!.mask.filter(Boolean).length).toBe(primer.length - 1)
  })

  it('keeps a 3-prime terminal mismatch inside the annealed duplex', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `${'T'.repeat(15)}${annealed.slice(0, -1)}A${'T'.repeat(15)}`
    const result = alignPrimerToTemplate(template, annealed, 'forward')
    expect(result).not.toBeNull()
    expect(result!.layout.components).toHaveLength(1)
    expect(result!.layout.components[0]).toMatchObject({
      primerBases: annealed,
      templateStart: 15,
      templateEnd: 35,
    })
    expect(result!.mask[result!.mask.length - 1]).toBe(false)
    expect(result!.mask.slice(0, -1).every(Boolean)).toBe(true)
  })

  it('keeps a multi-base central substitution inside one annealed duplex', () => {
    // Opportunistic off-diagonal matches in the substituted block tempt SW into indel
    // paths; those must not paint as a raised non-aligning segment when net length is
    // still 1:1 with the template.
    const left = 'GACCACCATGTC'
    const midTemplate = 'ATGCATGC'
    const midPrimer = 'CGATCGAT'
    const right = 'AACGTTGGCAAT'
    const template = `NNNN${left}${midTemplate}${right}NNNN`
    const primer = `${left}${midPrimer}${right}`
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    expect(result!.layout.components).toHaveLength(1)
    expect(result!.layout.components[0]).toMatchObject({
      primerBases: primer,
      templateStart: 4,
      templateEnd: 36,
    })
    expect(result!.mask.slice(0, left.length).every(Boolean)).toBe(true)
    expect(result!.mask.slice(left.length, left.length + midPrimer.length).every(Boolean)).toBe(false)
    expect(result!.mask.slice(left.length + midPrimer.length).every(Boolean)).toBe(true)
  })

  it('treats a short 5-prime stretch far from the duplex as overhang, not scattered', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    // The 5' "ATG" also occurs ~40 bases upstream of the real binding site.
    const template = `CCATGCC${'T'.repeat(40)}${annealed}${'T'.repeat(10)}`
    const primer = `ATG${'C'.repeat(4)}${annealed}`
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    // Only one annealed block (the real duplex). The 5' bases stay as a single overhang.
    const annealedComponents = result!.layout.components.filter((component) => component.templateStart !== undefined)
    expect(annealedComponents).toHaveLength(1)
    expect(annealedComponents[0]!.primerBases.endsWith(annealed)).toBe(true)
    // The 5' overhang bases are not annealed.
    expect(result!.mask.slice(0, 7).some(Boolean)).toBe(false)
  })

  it('marks extra primer bases between two strong duplex blocks as an oversize insert', () => {
    const left = 'CACCATGTCAAC'
    const right = 'GGTACCGAATTCAC'
    const template = `${'T'.repeat(10)}${left}${right}${'T'.repeat(10)}`
    const insert = 'TTTTTT'
    const primer = `${left}${insert}${right}`
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    const kinds = result!.layout.components.map((component) =>
      component.templateStart === undefined ? 'insert' : 'annealed',
    )
    expect(kinds).toEqual(['annealed', 'insert', 'annealed'])
    const insertComponent = result!.layout.components[1]!
    expect(insertComponent.primerBases).toBe(insert)
    // The two annealed blocks are adjacent on the template (no template gap), so the
    // extra primer bases form an oversize insert.
    const [first, , third] = result!.layout.components
    expect(third!.templateStart! - first!.templateEnd!).toBe(0)
  })

  it('keeps the 5-prime duplex when a long mid-insert would otherwise drop it', () => {
    // Local SW drops the 5' block once insert gap cost exceeds its match score
    // (~2 per match vs ~2 per insert extend). Recovery must restore an abutting left duplex.
    const left = 'GACCACCATGTCAACGTTGGCAATTCCTGAAGCTT'
    const right = 'AGCAATTCGTACGATCGTAGCTAGCTAGGAATTC'
    const insert = 'T'.repeat(40)
    const template = `${'N'.repeat(20)}${left}${right}${'N'.repeat(20)}`
    const primer = `${left}${insert}${right}`
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    const kinds = result!.layout.components.map((component) =>
      component.templateStart === undefined ? 'insert' : 'annealed',
    )
    expect(kinds).toEqual(['annealed', 'insert', 'annealed'])
    const [first, middle, third] = result!.layout.components
    expect(first!.primerBases.length).toBeGreaterThan(left.length - 3)
    expect(middle!.primerBases).toMatch(/^T+$/)
    expect(middle!.primerBases.length).toBeGreaterThanOrEqual(insert.length - 2)
    expect(third!.templateStart! - first!.templateEnd!).toBe(0)

    const insertOffset = first!.primerBases.length
    expect(
      result!.mask.slice(insertOffset, insertOffset + middle!.primerBases.length).some(Boolean),
    ).toBe(false)
    expect(result!.mask.slice(0, insertOffset).filter(Boolean).length).toBeGreaterThan(left.length - 3)
  })

  it('recovers a long 5-prime duplex across a short template gap beside the 3-prime seed', () => {
    // Soft SW often keeps only the 3′ stub when a few template bases sit between duplex
    // islands (e.g. FAPco Xba dir). Recovery must bridge short gaps (up to 8 bp), not only gap-0 inserts.
    const left = 'TCTAGAACCATGAAGACTTGGGTAAAAATCGTATTTGGAGTTGCCACCTCTGCTGTGCTTGCCTTATTGGTGATGTGCATTGTCTTAAGGCCC'
    const gap = 'TCT'
    const right = 'AGGTGCACAACAGCG'
    const fivePrime = 'AGA'
    const insertOverGap = 'AGC'
    const template = `${'N'.repeat(20)}${left}${gap}${right}${'N'.repeat(20)}`
    const primer = `${fivePrime}${left}${insertOverGap}${right}`
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    expect(result!.annealedCount).toBeGreaterThan(left.length + right.length - 6)
    const annealed = result!.layout.components.filter((component) => component.templateStart !== undefined)
    expect(annealed.length).toBeGreaterThanOrEqual(1)
    const span = Math.max(...annealed.map((c) => c.templateEnd!)) - Math.min(...annealed.map((c) => c.templateStart!))
    expect(span).toBeGreaterThanOrEqual(left.length + right.length)
  })

  it('keeps both arms of a reverse loop-out insertion primer', () => {
    // The dropped block can be either arm depending on which scores higher; for this
    // reverse primer SW abandons the 3' arm, which is the end that actually primes.
    const left = 'GACCACCATGTCAACGTTGGCAATTCCTGAAGCTT'
    const right = 'AGCAATTCGTACGATCGTAGCTAGCTAGGAATTC'
    const insert = 'T'.repeat(40)
    const flank = 'ACGTTGCATCCGATTACGCAGTCCATGGATCCTAGGCATC'
    const template = `${flank}${left}${right}${flank}`
    const primer = reverseComplement(`${left}${insert}${right}`)
    const result = alignPrimerToTemplate(template, primer, 'reverse')
    expect(result).not.toBeNull()
    const kinds = result!.layout.components.map((component) =>
      component.templateStart === undefined ? 'insert' : 'annealed',
    )
    expect(kinds).toEqual(['annealed', 'insert', 'annealed'])
    expect(result!.annealedCount).toBeGreaterThan(left.length + right.length - 6)
    // Tm must come from the primer's own 3' duplex, not the far arm.
    expect(result!.terminalSequence.length).toBeGreaterThan(left.length - 4)
    expect(primer.endsWith(result!.terminalSequence)).toBe(true)
  })

  it('leaves a non-templated 5-prime arm as overhang even beside a long insert', () => {
    // Recovery must not invent a duplex for an arm that has no upstream template match.
    const right = 'AGCAATTCGTACGATCGTAGCTAGCTAGGAATTC'
    const flank = 'ACGTTGCATCCGATTACGCAGTCCATGGATCCTAGGCATC'
    const template = `${flank}${flank}${right}${flank}`
    const primer = `${'TTAGGCC'.repeat(4)}${'A'.repeat(40)}${right}`
    const result = alignPrimerToTemplate(template, primer, 'forward')
    expect(result).not.toBeNull()
    const kinds = result!.layout.components.map((component) =>
      component.templateStart === undefined ? 'insert' : 'annealed',
    )
    expect(kinds).toEqual(['insert', 'annealed'])
    expect(result!.annealedCount).toBeLessThanOrEqual(right.length)
  })

  it('aligns a reverse primer and reports top-strand coordinates', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `${'A'.repeat(12)}${annealed}${'A'.repeat(12)}`
    const reversePrimer = reverseComplement(annealed)
    const result = alignPrimerToTemplate(template, reversePrimer, 'reverse')
    expect(result).not.toBeNull()
    expect(result!.layout.strand).toBe('reverse')
    expect(result!.layout.templateStart).toBe(12)
    expect(result!.layout.templateEnd).toBe(32)
    expect(result!.mask.every(Boolean)).toBe(true)
  })

  it('consolidates a single oversize insert instead of splitting on opportunistic gap matches', () => {
    const template = 'CTAGTATGAAATACCTGCTGCCGACCGCTGCTGCTGGTCTGCTGCTCCTCGCTGCCCAG'
    const left = 'CTAGTATGAAATACCTGCTGCCGACCG'
    const insert = 'AGAAGATCCCATT'
    const right = 'CTGCTGCTGGTCTGCTGCTCCTCGCTGCCCAG'
    const primer = `${left}${insert}${right}`
    const result = alignPrimerToTemplate(template, primer, 'forward')

    expect(result).not.toBeNull()
    expect(result!.layout.components.map((component) =>
      component.templateStart === undefined ? 'insert' : 'annealed',
    )).toEqual(['annealed', 'insert', 'annealed'])
    expect(result!.layout.components[1]!.primerBases).toBe(insert)
    expect(result!.layout.components[0]).toMatchObject({ templateStart: 0, templateEnd: 27 })
    expect(result!.layout.components[2]).toMatchObject({ templateStart: 27, templateEnd: 59 })
    expect(result!.mask.slice(27, 40).some(Boolean)).toBe(false)
  })

  it('reports every high-scoring binding site on each strand', () => {
    const annealed = 'GACCACCATGTC'
    const template = `NNNN${annealed}NNNN${annealed}NNNN`
    const primer = `GGGG${annealed}`
    const layouts = resolvePrimerBindingLayouts(template, primer, 'forward')
    expect(layouts).toHaveLength(2)
    expect(layouts.map((layout) => layout.templateStart).toSorted((a, b) => a - b)).toEqual([4, 20])
  })

  it('still resolves a single forward layout for a unique exact match', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `${'A'.repeat(12)}${annealed}${'A'.repeat(12)}`
    const layouts = resolvePrimerBindingLayouts(template, annealed, 'forward')
    expect(layouts).toHaveLength(1)
    expect(layouts[0]!.strand).toBe('forward')
  })
})
