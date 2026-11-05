import { describe, expect, it } from 'vitest'
import { detectGenBankTopology, importRequiresTopologyChoice } from '../src/domain/sequenceTopology'
import { parseGenBank } from '../src/domain/parsers'

describe('detectGenBankTopology', () => {
  it('reads circular and linear from LOCUS', () => {
    expect(detectGenBankTopology('LOCUS       X 10 bp DNA circular SYN 01-JAN-2020\n')).toBe('circular')
    expect(detectGenBankTopology('LOCUS       X 10 bp DNA linear SYN 01-JAN-2020\n')).toBe('linear')
  })

  it('returns null when topology is omitted', () => {
    expect(detectGenBankTopology('LOCUS       X 10 bp DNA SYN 01-JAN-2020\n')).toBeNull()
  })
})

describe('importRequiresTopologyChoice', () => {
  it('requires a choice for FASTA and raw sequence', () => {
    expect(importRequiresTopologyChoice('>seq\nATGC')).toBe(true)
    expect(importRequiresTopologyChoice('ATGCATGC')).toBe(true)
  })

  it('requires a choice for GenBank without topology', () => {
    const gb = `LOCUS       TEST 8 bp DNA SYN 01-JAN-2020
DEFINITION  test.
FEATURES             Location/Qualifiers
ORIGIN
        1 atgcatgc
//`
    expect(importRequiresTopologyChoice(gb)).toBe(true)
    expect(parseGenBank(gb).topology).toBe('circular')
  })

  it('does not require a choice when GenBank topology is present', () => {
    const gb = `LOCUS       TEST 8 bp DNA linear SYN 01-JAN-2020
DEFINITION  test.
ORIGIN
        1 atgcatgc
//`
    expect(importRequiresTopologyChoice(gb)).toBe(false)
    expect(parseGenBank(gb).topology).toBe('linear')
  })

  it('does not require a choice for project JSON', () => {
    expect(importRequiresTopologyChoice('{"schemaVersion":1,"record":{}}')).toBe(false)
  })

  it('does not require a choice for .seq or .ab1 file names', () => {
    expect(importRequiresTopologyChoice('ATGCATGC', 'read.seq')).toBe(false)
    expect(importRequiresTopologyChoice('ignored', 'trace.ab1')).toBe(false)
  })
})
