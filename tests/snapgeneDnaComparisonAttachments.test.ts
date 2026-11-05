// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { zlibSync, unzlibSync } from 'fflate'
import { cloneFixture } from '../src/domain/fixtures'
import { exportSnapGene, parseSnapGene } from '../src/domain/parsers'
import { initSnapGeneLzma } from '../src/domain/snapgeneLzma'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'
import type { HistoryNode } from '../src/domain/types'
import {
  encodeSnapGeneAttachmentPackets,
  parseSnapGeneAttachments,
  VIBEGENE_ATTACHMENT_FILE_NAME,
  VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME,
} from '../src/domain/snapgeneAttachments'
import {
  MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES,
  MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES,
} from '../src/domain/snapgeneDnaComparison'

beforeAll(async () => {
  await initSnapGeneLzma()
})

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function withAttachment(name: string, data: Uint8Array) {
  return concat([
    exportSnapGene(cloneFixture()),
    ...encodeSnapGeneAttachmentPackets([{ name, data, compressible: false }]),
  ])
}

function framed(uncompressed: Uint8Array, declaredLength = uncompressed.length) {
  const compressed = zlibSync(uncompressed)
  const data = new Uint8Array(4 + compressed.length)
  new DataView(data.buffer).setUint32(0, declaredLength, false)
  data.set(compressed, 4)
  return data
}

describe('SnapGene DNA comparison attachments', () => {
  it('round-trips and removes primer specificity alongside other DNA metadata', () => {
    const record = cloneFixture()
    const sequence = record.sequence.slice(0, 20).toUpperCase()
    const specificity = {
      primerSequence: sequence,
      searchedSequence: sequence,
      completedAt: '2026-11-18T00:00:00.000Z',
      result: {
        searchSet: { database: 'refseq_rna' as const, organism: '9606' },
        sequenceLength: sequence.length,
        sites: [{ accession: 'NM_1', title: 'Example', subjectLength: 200, low: 10, high: 29, strand: 'plus' as const, mismatches: 0, threePrimeMismatches: 0 }],
        truncated: false,
        fastSearch: false,
      },
    }
    record.primers = [{ id: 'p1', name: 'Test primer', sequence, color: '#7c3aed', specificity }]
    record.dna = { comparisonSources: [{ id: 's1', name: 'Source', sequence: 'ACGT', enabled: true }] }
    const imported = parseSnapGene(exportSnapGene(record), 'specificity.dna')
    expect(imported.primers.find((primer) => primer.name === 'Test primer')?.specificity).toEqual(specificity)
    expect(imported.dna?.comparisonSources).toEqual(record.dna.comparisonSources)
    imported.primers = imported.primers.map((primer) => ({ ...primer, specificity: undefined }))
    const reopened = parseSnapGene(exportSnapGene(imported), 'specificity.dna')
    expect(reopened.primers.find((primer) => primer.name === 'Test primer')?.specificity).toBeUndefined()
    expect(reopened.dna?.comparisonSources).toEqual(record.dna.comparisonSources)
  })
  it('exports compact metadata in the bounded compressed attachment and round-trips it', () => {
    const record = cloneFixture()
    record.dna = {
      comparisonSources: [{
        id: 'homolog-1',
        name: 'Homolog',
        sequence: 'ATGCGTACGT',
        enabled: true,
      }],
    }

    const bytes = exportSnapGene(record)
    const imported = parseSnapGene(bytes, 'metadata.dna')
    const attachments = parseSnapGeneAttachments(readAttachmentBlocks(bytes))
    const metadata = attachments.find((attachment) => attachment.name === VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME)

    expect(metadata).toBeDefined()
    expect(attachments.some((attachment) => attachment.name === VIBEGENE_ATTACHMENT_FILE_NAME)).toBe(false)
    expect(imported.sequence).toBe(record.sequence)
    expect(imported.dna?.comparisonSources).toEqual(record.dna.comparisonSources)

    const declaredLength = new DataView(metadata!.data.buffer, metadata!.data.byteOffset, 4).getUint32(0, false)
    const payload = unzlibSync(metadata!.data.subarray(4), { out: new Uint8Array(declaredLength) })
    expect(declaredLength).toBeLessThan(MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES)
    expect(metadata!.data.length - 4).toBeLessThan(MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES)
    expect(new TextDecoder().decode(payload)).not.toContain('\n')
  })

  it('still imports the legacy uncompressed vibegene.json attachment', () => {
    const record = cloneFixture()
    const dna = { comparisonSources: [{ id: 'legacy-1', name: 'Legacy', sequence: 'ACGT', enabled: true }] }
    const legacy = new TextEncoder().encode(JSON.stringify({
      schema: 'vibegene-dna-comparison',
      schemaVersion: 1,
      dna,
    }, null, 2))
    const imported = parseSnapGene(withAttachment(VIBEGENE_ATTACHMENT_FILE_NAME, legacy), 'legacy.dna')

    expect(imported.sequence).toBe(record.sequence)
    expect(imported.dna?.comparisonSources).toEqual(dna.comparisonSources)
  })

  it('persists pooled member history in the compressed metadata attachment', () => {
    const record = cloneFixture()
    const history: HistoryNode = {
      id: 'member-history',
      name: 'member.dna',
      seqLen: 4,
      circular: false,
      operation: 'manual',
      resurrectable: true,
      hideHistory: false,
      oligos: [],
      regeneratedSites: [],
      inputSummaries: [],
      features: [],
      children: [],
    }
    record.dna = { documentRole: 'library' }
    record.traceFiles = [{
      ...traceRecordFromSequence('ATGC', 'member.ab1'),
      history,
    }]

    const imported = parseSnapGene(exportSnapGene(record), 'pooled-history.dna')
    expect(imported.dna?.libraryMemberHistory).toMatchObject([
      { memberId: record.traceFiles[0]!.id, historyRef: expect.any(String) },
    ])
    expect(imported.dna?.libraryMemberHistoryPool?.version).toBe(1)
    expect(Object.keys(imported.dna?.libraryMemberHistoryPool?.nodes ?? {})).not.toHaveLength(0)
  })

  it('keeps base sequence import working for corrupt and over-limit compressed payloads', () => {
    const base = cloneFixture()
    const corrupt = new Uint8Array([0, 0, 0, 20, 0xff, 0xff, 0xff])
    const oversizedLength = new Uint8Array(5)
    new DataView(oversizedLength.buffer).setUint32(
      0,
      MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES + 1,
      false,
    )
    oversizedLength[4] = 0xff
    const oversizedCompressed = new Uint8Array(4 + MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES + 1)

    for (const data of [corrupt, oversizedLength, oversizedCompressed]) {
      const imported = parseSnapGene(
        withAttachment(VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME, data),
        'bad-metadata.dna',
      )
      expect(imported.sequence).toBe(base.sequence)
      expect(imported.dna?.documentRole).toBeUndefined()
      expect(imported.dna?.comparisonSources).toEqual([])
    }
  })

  it('rejects a compressed stream that expands beyond its declared length', () => {
    const base = cloneFixture()
    const validPrefix = new TextEncoder().encode(JSON.stringify({
      schema: 'vibegene-dna-comparison',
      schemaVersion: 1,
      dna: { comparisonSources: [{ id: 'zipbomb', name: 'x', sequence: 'A', enabled: true }] },
    }))
    const expanded = concat([validPrefix, new Uint8Array(4096).fill(0x20)])
    const imported = parseSnapGene(
      withAttachment(
        VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME,
        framed(expanded, validPrefix.length),
      ),
      'expanded-metadata.dna',
    )

    expect(imported.sequence).toBe(base.sequence)
    expect(imported.dna?.documentRole).toBeUndefined()
    expect(imported.dna?.comparisonSources).toEqual([])
  })
})

function readAttachmentBlocks(bytes: Uint8Array) {
  const blocks: Uint8Array[] = []
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const type = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    if (type === 0x17) blocks.push(bytes.subarray(start, end))
    offset = end
  }
  return blocks
}

describe('SnapGene attachment packet views', () => {
  it('returns attachment data as a view into the packet payload', () => {
    const packetData = new Uint8Array(8)
    new DataView(packetData.buffer).setUint32(0, 7, false)
    packetData.set([65, 67, 71, 84], 4)

    const [attachment] = parseSnapGeneAttachments([packetData])
    expect(attachment?.data.buffer).toBe(packetData.buffer)
    expect(attachment?.data.byteOffset).toBe(packetData.byteOffset + 4)
    expect(new TextDecoder().decode(attachment?.data)).toBe('ACGT')
  })
})
