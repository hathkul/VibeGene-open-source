import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import {
  openDesktopSequenceBytes,
  ownedArrayBufferFromBytes,
} from '../src/domain/openDesktopSequenceFile'
import { exportProjectJson } from '../src/domain/parsers'
import type { HistoryNode, SequenceRecord } from '../src/domain/types'

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function viewIntoLargerBuffer(text: string, padBefore = 3, padAfter = 5): Uint8Array {
  const payload = encode(text)
  const padded = new Uint8Array(padBefore + payload.byteLength + padAfter)
  padded.fill(0xff)
  padded.set(payload, padBefore)
  return padded.subarray(padBefore, padBefore + payload.byteLength)
}

function historyNode(sequence: string): HistoryNode {
  return {
    id: 'hist-root',
    name: 'Ancestor',
    seqLen: sequence.length,
    circular: true,
    operation: 'Imported',
    resurrectable: true,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [
      {
        name: 'ori',
        type: 'rep_origin',
        color: '#8b5cf6',
        strand: 'forward',
        segments: [{ start: 0, end: 4 }],
      },
    ],
    sequence,
    children: [],
  }
}

function constructRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: 'seq-json',
    name: 'Construct',
    description: 'from json',
    molecule: 'dna',
    topology: 'circular',
    sequence: 'ATGCGGATCC',
    features: [
      {
        id: 'feat-1',
        name: 'MCS',
        type: 'misc_feature',
        color: '#64748b',
        locations: [{ start: 4, end: 10, strand: 'forward' }],
      },
    ],
    primers: [],
    operations: [],
    history: historyNode('ATGCGGATCC'),
    construct: { ...defaultConstructProperties },
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ownedArrayBufferFromBytes', () => {
  it('copies a view with a nonzero offset into a tightly sized ArrayBuffer', () => {
    const view = viewIntoLargerBuffer('ATGC')
    expect(view.byteOffset).toBeGreaterThan(0)
    expect(view.buffer.byteLength).toBeGreaterThan(view.byteLength)

    const owned = ownedArrayBufferFromBytes(view)
    expect(owned).toBeInstanceOf(ArrayBuffer)
    expect(owned.byteLength).toBe(view.byteLength)
    expect(new TextDecoder().decode(new Uint8Array(owned))).toBe('ATGC')
    expect(owned).not.toBe(view.buffer)
  })

  it('copies SharedArrayBuffer-backed views into an owned ArrayBuffer', () => {
    expect(typeof SharedArrayBuffer).toBe('function')
    const shared = new SharedArrayBuffer(16)
    const view = new Uint8Array(shared, 4, 4)
    view.set(encode('GGCC'))

    const owned = ownedArrayBufferFromBytes(view)
    expect(owned).toBeInstanceOf(ArrayBuffer)
    expect(owned).not.toBeInstanceOf(SharedArrayBuffer)
    expect(new TextDecoder().decode(new Uint8Array(owned))).toBe('GGCC')
  })
})

describe('openDesktopSequenceBytes', () => {
  it('parses FASTA DNA from an offset view and applies the silent circular default', async () => {
    const fasta = '>pUC fragment\nATGCgtacgtaa\n'
    const opened = await openDesktopSequenceBytes(viewIntoLargerBuffer(fasta), 'fragment.fa')
    expect(opened.record.molecule).toBe('dna')
    expect(opened.record.topology).toBe('circular')
    expect(opened.record.sequence).toBe('ATGCgtacgtaa')
    expect(opened.record.construct).toEqual(defaultConstructProperties)
    expect(opened.record.operations[0]?.type).toBe('import')
    expect(opened.traces).toEqual([])
  })

  it('keeps protein FASTA linear and protein-normalized', async () => {
    const fasta = '>enzyme type=protein\nMKTAYIAKQR\n'
    const opened = await openDesktopSequenceBytes(encode(fasta), 'enzyme.faa')
    expect(opened.record.molecule).toBe('protein')
    expect(opened.record.topology).toBe('linear')
    expect(opened.record.sequence).toBe('MKTAYIAKQR')
    expect(opened.record.primers).toEqual([])
    expect(opened.record.dnaEnds).toBeUndefined()
    expect(opened.record.protein).toBeDefined()
  })

  it('opens project JSON with features and history already normalized', async () => {
    const json = exportProjectJson(constructRecord())
    const opened = await openDesktopSequenceBytes(encode(json), 'construct.json', '/tmp/construct.json')
    expect(opened.path).toBe('/tmp/construct.json')
    expect(opened.record.sequence).toBe('ATGCGGATCC')
    expect(opened.record.features.map((feature) => feature.name)).toEqual(['MCS'])
    expect(opened.record.history?.id).toBe('hist-root')
    expect(opened.record.history?.features[0]?.name).toBe('ori')
    expect(opened.record.construct).toEqual(defaultConstructProperties)
    expect(opened.record.operations[0]?.summary).toContain('construct.json')
  })

  it('respects GenBank topology instead of forcing circular', async () => {
    const gb = `LOCUS       TEST 8 bp DNA linear SYN 01-JAN-2020
DEFINITION  test.
FEATURES             Location/Qualifiers
     misc_feature    1..4
                     /label="tag"
ORIGIN
        1 atgcggcc
//
`
    const opened = await openDesktopSequenceBytes(encode(gb), 'test.gb')
    expect(opened.record.molecule).toBe('dna')
    expect(opened.record.topology).toBe('linear')
    expect(opened.record.sequence).toBe('ATGCGGCC')
    expect(opened.record.features.some((feature) => feature.name === 'tag')).toBe(true)
  })

  it('opens .seq files as linear DNA without a topology prompt override', async () => {
    const opened = await openDesktopSequenceBytes(encode('atgcgtac'), 'read.seq')
    expect(opened.record.molecule).toBe('dna')
    expect(opened.record.topology).toBe('linear')
    expect(opened.record.sequence).toBe('atgcgtac')
    expect(opened.record.dnaEnds).toBeDefined()
  })

  it('rejects settings JSON as a construct window', async () => {
    await expect(
      openDesktopSequenceBytes(
        encode(JSON.stringify({ schemaVersion: 1, kind: 'vibegene-settings' })),
        'settings.json',
      ),
    ).rejects.toThrow('Settings files cannot open as a construct window')
  })
})
