import { describe, expect, it } from 'vitest'
import {
  isTraceDocumentFileName,
  isTraceDocumentMutationAction,
  pairDroppedFiles,
  traceDocumentDescriptionPanelVisible,
  traceDocumentTitleName,
  traceDocumentSequenceLayoutClass,
  traceForSequenceConversion,
} from './traceDocument'
import type { TraceFileRecord } from '../domain/traceTypes'

const trace: TraceFileRecord = {
  id: 'trace-1', fileName: 'read.ab1', sequence: 'ATGC', enabled: true, expanded: false,
  showAnnotations: true, alignment: null,
  chromatogram: { aTrace: [1, 2], tTrace: [3, 4], gTrace: [5, 6], cTrace: [7, 8], basePos: [0, 1], baseCalls: ['A', 'T'] },
}

describe('trace document routing and conversion', () => {
  it('recognizes AB1 as a trace document, not a normal sequence file', () => {
    expect(isTraceDocumentFileName('read.AB1')).toBe(true)
    expect(isTraceDocumentFileName('read.dna')).toBe(false)
  })

  it('keeps the complete AB1 name in the trace workspace title', () => {
    expect(traceDocumentTitleName('PET_FN2-HE3_pET_seq_rev_F02.ab1', 'shell')).toBe('PET_FN2-HE3_pET_seq_rev_F02.ab1')
  })

  it('makes the trace viewer span the full sequence workspace grid', () => {
    expect(traceDocumentSequenceLayoutClass(true)).toBe(' is-sequence-only')
    expect(traceDocumentSequenceLayoutClass(false)).toBe('')
  })

  it('suppresses the description panel for trace inspection without changing its preference', () => {
    expect(traceDocumentDescriptionPanelVisible(true, true)).toBe(false)
    expect(traceDocumentDescriptionPanelVisible(true, false)).toBe(true)
    expect(traceDocumentDescriptionPanelVisible(false, false)).toBe(false)
  })

  it('blocks record-mutating actions but leaves Open and Tools available', () => {
    expect(isTraceDocumentMutationAction('features.add')).toBe(true)
    expect(isTraceDocumentMutationAction('file.save')).toBe(true)
    expect(isTraceDocumentMutationAction('file.open')).toBe(false)
    expect(isTraceDocumentMutationAction('tools.agarose-gel')).toBe(false)
  })

  it('retains native paths through a mixed trace/construct drop', () => {
    const files = [{ name: 'read.ab1' }, { name: 'construct.dna' }]
    const paired = pairDroppedFiles(files, ['/tmp/read.ab1', '/tmp/construct.dna'])
    expect(paired.filter(({ file }) => !isTraceDocumentFileName(file.name))[0]?.path).toBe('/tmp/construct.dna')
  })

  it('identifies AB1 files in both primary and later mixed-drop positions', () => {
    for (const files of [
      [{ name: 'first.ab1' }, { name: 'construct.dna' }],
      [{ name: 'construct.dna' }, { name: 'later.ab1' }],
    ]) {
      const entries = pairDroppedFiles(files, files.map((file) => `/tmp/${file.name}`))
      const traceEntries = entries.filter(({ file }) => isTraceDocumentFileName(file.name))
      expect(traceEntries).toHaveLength(1)
      expect(traceEntries[0]?.path).toBe(`/tmp/${traceEntries[0]?.file.name}`)
    }
  })

  it('reverse conversion flips both calls and chromatogram channels', () => {
    const converted = traceForSequenceConversion(trace, 'reverse')
    expect(converted.sequence).toBe('GCAT')
    expect(converted.chromatogram.aTrace).toEqual([4, 3])
    expect(converted.chromatogram.tTrace).toEqual([2, 1])
    expect(converted.expanded).toBe(true)
  })
})
