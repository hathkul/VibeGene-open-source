import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import {
  analyzeMutagenesis,
  assembleMutagenesisProduct,
  mutagenesisPreviewRecord,
} from '../src/domain/mutagenesis'
import { reverseComplement } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'

function template(sequence: string, primers: SequenceRecord['primers'] = []): SequenceRecord {
  return {
    id: 'template',
    name: 'Template',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers,
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: defaultConstructProperties,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }
}

describe('mutagenesis', () => {
  it('accepts a central mismatch with annealed flanks', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const core = `${left}C${right}`
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${core}${flank}`)
    const oligo = `${left}A${right}`

    const analysis = analyzeMutagenesis(record, oligo, 'Mut fwd')
    expect(analysis).not.toBeNull()
    expect(analysis!.status).toBe('ready')
    expect(analysis!.message).toBe('Ready to Mutagenize')
    expect(analysis!.mismatchCount).toBeGreaterThan(0)
    expect(analysis!.glyphs.some((glyph) => glyph.role === 'mismatch')).toBe(true)

    const product = assembleMutagenesisProduct({
      template: record,
      analysis: analysis!,
      productName: 'Mutagenized.dna',
    })
    expect(product.sequence).toContain(`${left}A${right}`)
    expect(product.sequence).not.toContain(core)
    expect(product.history?.operation).toBe('mutate')
    expect(product.description).toBe('Site-directed mutagenesis product')
  })

  it('reports when the primer has no mismatches', () => {
    const match = 'ACTTTGCTTATGAAATGGAGGCAAGG'
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${match}${flank}`)
    const analysis = analyzeMutagenesis(record, match, 'Perfect')
    expect(analysis).not.toBeNull()
    expect(analysis!.status).toBe('no-mismatch')
    expect(analysis!.message.toLowerCase()).toContain('no mismatches')
  })

  it('requires the 5′ end to anneal', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const core = `${left}C${right}`
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${core}${flank}`)
    // Long 5′ overhang that cannot anneal adjacent to the site.
    const oligo = `TTTTTTTTTTTTTTTT${left}A${right}`
    const analysis = analyzeMutagenesis(record, oligo, 'Bad 5 prime')
    expect(analysis).not.toBeNull()
    // Either no useful anneal or explicit 5′ failure — both block mutagenesis.
    expect(['five-prime', 'no-anneal']).toContain(analysis!.status)
    if (analysis!.status === 'five-prime') {
      expect(analysis!.message.toLowerCase()).toContain("5′")
    }
  })

  it('mutagenizes with a reverse-strand oligo', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const core = `${left}C${right}`
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${core}${flank}`)
    const oligo = reverseComplement(`${left}A${right}`)
    const analysis = analyzeMutagenesis(record, oligo, 'Mut rev')
    expect(analysis).not.toBeNull()
    expect(analysis!.status).toBe('ready')
    expect(analysis!.anneal.layout.strand).toBe('reverse')

    const product = assembleMutagenesisProduct({
      template: record,
      analysis: analysis!,
      productName: 'Mutagenized.dna',
    })
    expect(product.sequence).toContain(`${left}A${right}`)
  })

  it('counts only mutagenized bases for delete/insert details', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const core = `${left}C${right}`
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${core}${flank}`)
    const oligo = `${left}A${right}`
    const analysis = analyzeMutagenesis(record, oligo, 'Mut fwd')
    expect(analysis!.status).toBe('ready')
    expect(analysis!.mismatchCount).toBeGreaterThan(0)
    expect(analysis!.deletedBp).toBeLessThan(oligo.length)
    expect(analysis!.insertedBp).toBeLessThan(oligo.length)
    expect(analysis!.deletedBp + analysis!.insertedBp + analysis!.mismatchCount).toBeLessThan(oligo.length)
    // Pure substitution: no bulk delete/insert of the whole anneal span.
    expect(analysis!.detailLines.some((line) => line.includes(`${oligo.length}`))).toBe(false)
  })

  it('flags true 5′ overhang adapters, not reverse-strand annealer component order', () => {
    const anneal = 'AAGTTCACCATAGTTTTTCCACACAACC'
    const overhang = 'AGAGAGTCTAGA'
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${anneal}${flank}`)
    const oligo = `${overhang}${anneal}`
    const analysis = analyzeMutagenesis(record, oligo, 'Xba adapter')
    expect(analysis!.status).toBe('five-prime')
    expect(analysis!.fivePrimeAnneals).toBe(false)
    expect(analysis!.anneal.mask[0]).toBe(false)
  })

  it('preview record shows only the mutagenic primer binding', () => {
    const left = 'ACTTTGCTTATGAAA'
    const right = 'TGGAGGCAAGG'
    const core = `${left}C${right}`
    const flank = 'GATC'.repeat(40)
    const record = template(`${flank}${core}${flank}`, [
      {
        id: 'other',
        name: 'Other primer',
        sequence: 'AAAAAAAAAA',
        color: '#000',
        bindings: [],
        visible: true,
      },
    ])
    const oligo = `${left}A${right}`
    const analysis = analyzeMutagenesis(record, oligo, 'PCR fragment')
    expect(analysis!.status).toBe('ready')

    const preview = mutagenesisPreviewRecord(record, analysis!)
    expect(preview.primers).toHaveLength(1)
    expect(preview.primers[0]!.id).toBe('mutagenesis-primer')
    expect(preview.primers[0]!.name).toBe('PCR fragment')
    expect(preview.primers[0]!.bindings).toHaveLength(1)
    expect(preview.primers[0]!.bindings![0]).toEqual(analysis!.anneal.layout)
  })
})
