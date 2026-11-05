import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseSnapGeneBlock13EnzymeSetName,
  resolveSnapGeneBlock3ForExport,
  serializeSnapGeneEnzymeCacheForJson,
  deserializeSnapGeneEnzymeCacheFromJson,
  snapGeneEnzymeCacheFromBlocks,
  snapGeneEnzymeCacheForSequence,
  snapGeneEnzymeSetNameToVibegenePreset,
  vibegeneEnzymeDisplayFromSnapGeneRecord,
  vibegeneEnzymePresetToSnapGeneSet,
} from '../src/domain/snapgeneEnzymeData'
import { defaultSnapGeneExportOptions, snapGeneEnzymeBlock13 } from '../src/domain/snapgeneEnzymeExport'
import { exportSnapGene } from '../src/domain/parsers'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function makeRecord(sequence: string, snapGeneEnzymes?: SequenceRecord['snapGeneEnzymes']): SequenceRecord {
  return {
    id: 'seq-1',
    name: 'test',
    description: 'test',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
    snapGeneEnzymes,
  }
}

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

describe('snapgeneEnzymeData', () => {
  it('maps SnapGene enzyme set names to Vibegene presets', () => {
    expect(snapGeneEnzymeSetNameToVibegenePreset('Unique 6+ Cutters')).toBe('unique-six-plus')
    expect(snapGeneEnzymeSetNameToVibegenePreset('6+ Cutters')).toBe('six-plus')
    expect(snapGeneEnzymeSetNameToVibegenePreset('All Commercial')).toBe('all')
  })

  it('maps Vibegene presets to SnapGene block 13 templates', () => {
    expect(vibegeneEnzymePresetToSnapGeneSet('unique-six-plus')).toBe('unique-6-plus')
    expect(snapGeneEnzymeBlock13('unique-6-plus').length).toBe(345)
  })

  it('round-trips enzyme cache through project JSON helpers', () => {
    const block13 = snapGeneEnzymeBlock13('unique-6-plus')
    const cache = snapGeneEnzymeCacheFromBlocks(new Uint8Array([1, 2, 3]), block13)
    const json = serializeSnapGeneEnzymeCacheForJson(cache)
    const restored = deserializeSnapGeneEnzymeCacheFromJson(json)
    expect(restored?.block3).toEqual(new Uint8Array([1, 2, 3]))
    expect(restored?.block13?.length).toBe(345)
    expect(restored?.enzymeSetName).toBe('Unique 6+ Cutters')
  })

  it('uses cached block 3 only when sequence length matches', () => {
    const block3 = new Uint8Array([9, 8, 7])
    const record = makeRecord('ATGC', { block3, cachedSequenceLength: 4 })
    expect(resolveSnapGeneBlock3ForExport(record)).toEqual(block3)
    expect(resolveSnapGeneBlock3ForExport({ ...record, sequence: 'ATGCG' }).length).toBe(8136)
  })

  it('imports enzyme display from SnapGene block 13', () => {
    const block13 = snapGeneEnzymeBlock13('unique-6-plus')
    const record = makeRecord('ATGC', snapGeneEnzymeCacheFromBlocks(undefined, block13))
    expect(vibegeneEnzymeDisplayFromSnapGeneRecord(record)).toEqual({ set: 'unique-six-plus' })
  })

  it('re-exports SnapGene enzyme blocks from pDemo fixture bytes', () => {
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(readFileSync(join(fixtureDir, 'VibeGene-pDemo (input).dna')))
    } catch {
      return
    }

    const block3 = readSnapGenePacket(bytes, 0x03)
    const block13 = readSnapGenePacket(bytes, 0x0d)
    expect(block3?.length).toBe(8136)
    expect(block13?.length).toBe(345)
    expect(parseSnapGeneBlock13EnzymeSetName(block13!)).toBe('Unique 6+ Cutters')

    const sequencePacket = readSnapGenePacket(bytes, 0x00)
    const sequence = new TextDecoder('ascii').decode(sequencePacket!.slice(1))
    const record = makeRecord(
      sequence,
      snapGeneEnzymeCacheForSequence(snapGeneEnzymeCacheFromBlocks(block3!, block13!), sequence.length),
    )

    const exported = exportSnapGene(record, defaultSnapGeneExportOptions())
    expect(readSnapGenePacket(exported, 0x03)?.length).toBe(8136)
    expect(parseSnapGeneBlock13EnzymeSetName(readSnapGenePacket(exported, 0x0d)!)).toBe('Unique 6+ Cutters')
  })
})
