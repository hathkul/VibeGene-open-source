// @vitest-environment jsdom

import { describe, expect, it, beforeAll } from 'vitest'
import { exportSnapGene, parseSnapGene } from '../src/domain/parsers'
import { exportSnapGeneHistoryTreeXml, prepareExportHistory, recordColorEditInHistory, recordSequenceEditInHistory, classifySequenceEdit, sequenceEditOperationMeta, netSequenceReplacement } from '../src/domain/snapgeneHistoryExport'
import { decompressSnapGeneXz, initSnapGeneLzma, isSnapGeneXzPayload } from '../src/domain/snapgeneLzma'
import { parseSnapGeneStrandColorsXml } from '../src/domain/snapgeneStrandColors'
import { defaultConstructProperties } from '../src/domain/constructProperties'

function readSnapGenePacket(bytes: Uint8Array, targetType: number) {
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const type = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    if (type === targetType) return bytes.slice(start, end)
    offset = end
  }
  return null
}

beforeAll(async () => {
  await initSnapGeneLzma()
})

describe('snapgene history export', () => {
  it('exports block 7 with HistoryColors for painted sequences', () => {
    const record = {
      id: 'seq-1',
      name: 'colors.dna',
      description: 'test',
      molecule: 'dna' as const,
      topology: 'circular' as const,
      sequence: 'ATGCGTACGTAAAA',
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
      strandColors: {
        type: 'Product' as const,
        topStrand: [{ start: 2, end: 6, color: 'red' }],
        bottomStrand: [{ start: 4, end: 8, color: 'blue' }],
      },
    }

    const bytes = exportSnapGene(record)
    const historyPacket = readSnapGenePacket(bytes, 0x07)
    expect(historyPacket).not.toBeNull()
    expect(isSnapGeneXzPayload(historyPacket!)).toBe(true)

    const colorsPacket = readSnapGenePacket(bytes, 0x14)
    expect(colorsPacket).not.toBeNull()
    expect(new TextDecoder().decode(colorsPacket!)).toContain('colors="red"')

    const historyXml = new TextDecoder().decode(decompressSnapGeneXz(historyPacket!))
    expect(historyXml).toContain('<HistoryColors>')
    expect(historyXml).toContain('colors="red"')
    expect(historyXml).toContain('colors="blue"')

    const prepared = prepareExportHistory(record)
    const exportedColors = parseSnapGeneStrandColorsXml(exportSnapGeneHistoryTreeXml(prepared!, 'dna'), record.sequence.length)
    expect(exportedColors?.topStrand).toEqual([{ start: 2, end: 6, color: 'red' }])
    expect(exportedColors?.bottomStrand).toEqual([{ start: 4, end: 8, color: 'blue' }])
  })

  it('records color edits in the history tree', () => {
    const base = {
      id: 'seq-1',
      name: 'paint.dna',
      description: 'test',
      molecule: 'dna' as const,
      topology: 'linear' as const,
      sequence: 'AAAAATTTTT',
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
      strandColors: {
        topStrand: [{ start: 1, end: 4, color: 'green' }],
        bottomStrand: [],
      },
    }
    const history = recordColorEditInHistory(undefined, base, { start: 1, end: 4 })
    expect(history.operation).toBe('replace')
    expect(history.historyColors?.topStrand).toEqual([{ start: 1, end: 4, color: 'green' }])
    expect(history.children[0]?.operation).toBe('invalid')
    expect(exportSnapGeneHistoryTreeXml(history, 'dna')).toContain('<HistoryColors>')
  })

  it('records insert / remove / replace base edits in the history tree', () => {
    const before = {
      id: 'seq-1',
      name: 'edit.dna',
      description: 'test',
      molecule: 'dna' as const,
      topology: 'linear' as const,
      sequence: 'ATGCATGC',
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    }

    const afterInsert = { ...before, sequence: 'ATGCGGGCATGC' }
    const insertHistory = recordSequenceEditInHistory(undefined, before, afterInsert, {
      start: 4,
      end: 4,
      insertedLength: 3,
    })
    expect(insertHistory.operation).toBe('insert')
    expect(insertHistory.editSession).toBe(true)
    expect(insertHistory.seqLen).toBe(12)
    expect(insertHistory.inputSummaries).toEqual([{ manipulation: 'insertAt', val1: '4' }])
    expect(insertHistory.children[0]?.sequence).toBe('ATGCATGC')
    expect(insertHistory.children[0]?.resurrectable).toBe(true)
    expect(exportSnapGeneHistoryTreeXml(insertHistory, 'dna')).toContain('operation="insert"')

    // Further edits coalesce into the same session and keep the original snapshot.
    const afterMore = { ...before, sequence: 'ATGCGGGAAAATGC' }
    const coalesced = recordSequenceEditInHistory(insertHistory, afterInsert, afterMore, {
      start: 7,
      end: 7,
      insertedLength: 3,
    })
    expect(coalesced.id).toBe(insertHistory.id)
    expect(coalesced.children[0]?.sequence).toBe('ATGCATGC')
    expect(coalesced.children).toHaveLength(1)
    expect(coalesced.operation).toBe('insert')
    expect(coalesced.inputSummaries).toEqual([{ manipulation: 'insertAt', val1: '4' }])
    expect(netSequenceReplacement('ATGCATGC', 'ATGCGGGAAAATGC')).toEqual({
      start: 4,
      end: 4,
      insertedLength: 6,
    })

    // A later overwrite in the same session becomes a net replace.
    const afterOverwrite = { ...before, sequence: 'ATGCGGGC' }
    const replaced = recordSequenceEditInHistory(coalesced, afterMore, afterOverwrite, {
      start: 4,
      end: 14,
      insertedLength: 4,
    })
    expect(replaced.id).toBe(insertHistory.id)
    expect(replaced.children[0]?.sequence).toBe('ATGCATGC')
    expect(replaced.operation).toBe('replace')
    expect(classifySequenceEdit(netSequenceReplacement('ATGCATGC', 'ATGCGGGC'))).toBe('replace')

    // Undoing back to the snapshot drops the session entirely.
    const restored = recordSequenceEditInHistory(replaced, afterOverwrite, before, {
      start: 4,
      end: 8,
      insertedLength: 0,
    })
    expect(restored.editSession).toBeUndefined()
    expect(restored.sequence).toBe('ATGCATGC')
    expect(restored.operation).toBe('invalid')

    const afterReplace = { ...before, sequence: 'ATGGGGGC' }
    const replaceHistory = recordSequenceEditInHistory(undefined, before, afterReplace, {
      start: 2,
      end: 6,
      insertedLength: 4,
    })
    expect(replaceHistory.operation).toBe('replace')
    expect(classifySequenceEdit({ start: 2, end: 6, insertedLength: 4 })).toBe('replace')
    expect(sequenceEditOperationMeta({ start: 2, end: 6, insertedLength: 4 }).summary).toContain('Replaced')
  })

  it('prepareExportHistory syncs current colors onto an imported history root', () => {
    const importedHistory = recordColorEditInHistory(undefined, {
      id: 'seq-1',
      name: 'mixed.dna',
      description: 'test',
      molecule: 'dna',
      topology: 'circular',
      sequence: 'A'.repeat(22),
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    }, { start: 2, end: 5 })

    const prepared = prepareExportHistory({
      id: 'seq-1',
      name: 'mixed.dna',
      description: 'test',
      molecule: 'dna',
      topology: 'circular',
      sequence: 'A'.repeat(22),
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
      history: importedHistory,
      strandColors: {
        type: 'Product',
        topStrand: [{ start: 0, end: 3, color: 'orange' }],
        bottomStrand: [],
      },
    })
    expect(prepared?.historyColors?.topStrand).toEqual([{ start: 0, end: 3, color: 'orange' }])
    expect(exportSnapGeneHistoryTreeXml(prepared!, 'dna')).toContain('colors="orange"')
  })

  it('round-trips sequences for Vibegene-created history nodes', () => {
    const record = {
      id: 'seq-1',
      name: 'database-export.dna',
      description: 'test',
      molecule: 'dna' as const,
      topology: 'circular' as const,
      sequence: 'AAAACCCC',
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
      history: {
        id: 'history_product',
        name: 'database-export.dna',
        seqLen: 8,
        circular: true,
        operation: 'assemble',
        resurrectable: false,
        hideHistory: false,
        oligos: [],
        regeneratedSites: [],
        inputSummaries: [],
        features: [],
        children: [{
          id: 'history_parent',
          name: 'parent.dna',
          seqLen: 8,
          circular: false,
          operation: 'invalid',
          resurrectable: true,
          hideHistory: false,
          oligos: [],
          regeneratedSites: [],
          inputSummaries: [],
          features: [],
          sequence: 'ATGCATGC',
          children: [],
        }],
      },
    }

    const reopened = parseSnapGene(exportSnapGene(record), record.name)
    expect(reopened.history?.children[0]).toMatchObject({
      name: 'parent.dna',
      sequence: 'ATGCATGC',
      seqLen: 8,
    })
  })
})
