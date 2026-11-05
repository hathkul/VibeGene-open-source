import { describe, expect, it } from 'vitest'
import {
  databaseAlignmentTraceAddedStatus,
  planDatabaseAlignmentIntake,
} from './databaseAlignmentIntakePlan'

describe('planDatabaseAlignmentIntake', () => {
  it('returns empty-selection status', () => {
    expect(planDatabaseAlignmentIntake({
      mode: 'dna',
      constructs: [],
      dnaAlignmentMode: 'trace',
    })).toEqual({ kind: 'status', message: 'No constructs were selected to add to alignment.' })
  })

  it('guards DNA mode when only protein constructs are selected', () => {
    expect(planDatabaseAlignmentIntake({
      mode: 'dna',
      constructs: [{ name: 'P1', sequence: 'ACDEFG', molecule: 'protein' }],
      dnaAlignmentMode: 'trace',
    })).toEqual({ kind: 'status', message: 'Select DNA constructs to add to DNA alignment.' })
  })

  it('plans comparative DNA source append', () => {
    const plan = planDatabaseAlignmentIntake({
      mode: 'dna',
      constructs: [{ name: 'Ins', sequence: 'acgt', molecule: 'dna' }],
      dnaAlignmentMode: 'comparative',
    })
    expect(plan.kind).toBe('dna-comparative-append')
    if (plan.kind !== 'dna-comparative-append') return
    expect(plan.sources).toHaveLength(1)
    expect(plan.sources[0]?.sequence).toBe('ACGT')
    expect(plan.message).toBe('Added 1 DNA comparison sequence from Database.')
  })

  it('plans trace alignment entries for DNA mode', () => {
    const plan = planDatabaseAlignmentIntake({
      mode: 'dna',
      constructs: [
        { name: 'A', sequence: 'ACGT', molecule: 'dna' },
        { name: 'B', sequence: 'GGTACC', molecule: 'rna' },
      ],
      dnaAlignmentMode: 'trace',
    })
    expect(plan).toEqual({
      kind: 'dna-trace-align',
      entries: [
        { name: 'A', sequence: 'ACGT' },
        { name: 'B', sequence: 'GGTACC' },
      ],
      progressMessage: 'Aligning 2 Database constructs…',
    })
  })

  it('plans protein comparison append with DNA and protein kinds', () => {
    const plan = planDatabaseAlignmentIntake({
      mode: 'protein',
      constructs: [
        { name: 'DNA CDS', sequence: 'ATGC', molecule: 'dna' },
        { name: 'Prot', sequence: 'ACDEF', molecule: 'protein' },
      ],
      dnaAlignmentMode: 'trace',
    })
    expect(plan.kind).toBe('protein-append')
    if (plan.kind !== 'protein-append') return
    expect(plan.sources).toHaveLength(2)
    expect(plan.sources[0]?.kind).toBe('dna')
    expect(plan.sources[1]?.kind).toBe('protein')
  })

  it('returns no alignable status when protein mode yields no sources', () => {
    expect(planDatabaseAlignmentIntake({
      mode: 'protein',
      constructs: [{ name: 'Bad', sequence: '---', molecule: 'protein' }],
      dnaAlignmentMode: 'trace',
    })).toEqual({ kind: 'status', message: 'No alignable sequences in the Database selection.' })
  })
})

describe('databaseAlignmentTraceAddedStatus', () => {
  it('formats library and trace outcomes', () => {
    expect(databaseAlignmentTraceAddedStatus(0, false)).toBe('No alignable DNA sequences in the Database selection.')
    expect(databaseAlignmentTraceAddedStatus(2, true)).toBe('Added 2 members from Database.')
    expect(databaseAlignmentTraceAddedStatus(1, false)).toBe('Added 1 alignment from Database.')
  })
})
