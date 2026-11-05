import { describe, expect, it } from 'vitest'
import {
  isAlignmentTraceFileName,
  parseAlignmentTraceText,
} from '../src/domain/alignmentTraceImport'
import { appendAlignedTraceFromText } from '../src/domain/traceFileWorkflow'

describe('alignmentTraceImport', () => {
  it('recognizes supported alignment file extensions', () => {
    expect(isAlignmentTraceFileName('read.ab1')).toBe(true)
    expect(isAlignmentTraceFileName('plasmid.dna')).toBe(true)
    expect(isAlignmentTraceFileName('fragment.gb')).toBe(true)
    expect(isAlignmentTraceFileName('chr.flat')).toBe(true)
    expect(isAlignmentTraceFileName('query.seq')).toBe(true)
    expect(isAlignmentTraceFileName('notes.md')).toBe(false)
  })

  it('parses raw pasted sequence', () => {
    const trace = parseAlignmentTraceText('atgcatgc', 'Pasted sequence')
    expect(trace?.sequence).toBe('ATGCATGC')
    expect(trace?.chromatogram.baseCalls).toEqual(['A', 'T', 'G', 'C', 'A', 'T', 'G', 'C'])
    expect(trace?.chromatogram.aTrace).toEqual([])
  })

  it('parses pasted FASTA', () => {
    const trace = parseAlignmentTraceText('>read1 example\natgc\ncccc', 'Pasted sequence')
    expect(trace?.fileName).toBe('read1')
    expect(trace?.sequence).toBe('ATGCCCCC')
  })

  it('parses pasted GenBank ORIGIN block', () => {
    const trace = parseAlignmentTraceText(
      `LOCUS       TEST       8 bp    DNA     linear       01-JAN-1980
ORIGIN
        1 atgc atgc
//
`,
      'Pasted sequence',
    )
    expect(trace?.sequence).toBe('ATGCATGC')
  })
})

describe('appendAlignedTraceFromText', () => {
  it('aligns pasted sequence against the template', async () => {
    const result = await appendAlignedTraceFromText('ATGCATGC', 'Pasted sequence', 'NNNATGCATGCNNN', [])
    expect(result.addedCount).toBe(1)
    expect(result.traces[0]?.alignment?.templateStart).toBe(3)
    expect(result.traces[0]?.alignment?.templateEnd).toBe(11)
  })
})
