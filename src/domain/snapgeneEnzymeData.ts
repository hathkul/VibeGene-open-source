import { pdemoEnzymeBlock2, pdemoEnzymeBlock3Full } from './snapgeneEnzymeCacheTemplates'
import type { SnapGeneEnzymeSet } from './snapgeneEnzymeExport'
import { defaultSnapGeneExportOptions, type SnapGeneExportOptions } from './snapgeneEnzymeExport'
import type { EnzymeManufacturerId, SequenceRecord } from './types'
import { enzymes } from './enzymes'
import { isTypeIisEnzyme } from './typeIisEnzymes'

/** Vibegene enzyme display presets that map to SnapGene block 13 names. */
export type VibegeneSnapGeneEnzymePreset =
  | 'all'
  | 'nonredundant'
  | 'unique'
  | 'unique-dual'
  | 'six-plus'
  | 'unique-six-plus'
  | 'type-iis'

export type SnapGeneEnzymeCache = {
  /** Stable SnapGene document UUID from Notes block. */
  documentUuid?: string
  /** Human-readable enzyme set from SnapGene block 13 (e.g. "Unique 6+ Cutters"). */
  enzymeSetName?: string
  /** Sequence length when block 3 was captured — used to detect stale cache. */
  cachedSequenceLength?: number
  /** Enzymes SnapGene marks hidden in block 0x1c (EnzymeVisibilities). */
  hiddenEnzymeNames?: string[]
  block2?: Uint8Array
  block3?: Uint8Array
  block13?: Uint8Array
}

export type SnapGeneEnzymeCacheJson = {
  documentUuid?: string
  enzymeSetName?: string
  cachedSequenceLength?: number
  hiddenEnzymeNames?: string[]
  block2Base64?: string
  block3Base64?: string
  block13Base64?: string
}

const SNAPGENE_TO_VIBEGENE_SET: Array<{ pattern: RegExp; set: VibegeneSnapGeneEnzymePreset }> = [
  { pattern: /^unique 6\+ cutters$/i, set: 'unique-six-plus' },
  { pattern: /^6\+ cutters$/i, set: 'six-plus' },
  { pattern: /^unique cutters$/i, set: 'unique' },
  { pattern: /^unique & dual cutters$/i, set: 'unique-dual' },
  { pattern: /^all commercial$/i, set: 'all' },
  { pattern: /^nonredundant$/i, set: 'nonredundant' },
]

const VIBEGENE_TO_SNAPGENE_SET: Partial<Record<VibegeneSnapGeneEnzymePreset, SnapGeneEnzymeSet>> = {
  'unique-six-plus': 'unique-6-plus',
  'six-plus': 'six-plus',
  unique: 'unique-cutters',
  all: 'all-commercial',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function parseSnapGeneBlock13EnzymeSetName(block13: Uint8Array): string | null {
  if (block13.length < 20) return null
  for (let start = 15; start <= 22; start += 1) {
    const chunk = block13.slice(start, start + 80)
    const zero = chunk.indexOf(0)
    if (zero < 4) continue
    const name = new TextDecoder().decode(chunk.slice(0, zero)).trim()
    const hasInvalidCharacter = [...name].some((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint <= 0x1f || codePoint === 0x7f || codePoint === 0xfffd
    })
    if (!hasInvalidCharacter) return name
  }
  return null
}

export function snapGeneEnzymeSetNameToVibegenePreset(name: string): VibegeneSnapGeneEnzymePreset | null {
  const trimmed = name.trim()
  for (const entry of SNAPGENE_TO_VIBEGENE_SET) {
    if (entry.pattern.test(trimmed)) return entry.set
  }
  return null
}

export function vibegeneEnzymePresetToSnapGeneSet(
  set: VibegeneSnapGeneEnzymePreset | 'custom' | 'supplier',
): SnapGeneEnzymeSet {
  if (set === 'custom' || set === 'supplier' || set === 'unique-dual' || set === 'nonredundant') {
    return 'unique-6-plus'
  }
  return VIBEGENE_TO_SNAPGENE_SET[set] ?? 'unique-6-plus'
}

export function snapGeneEnzymeCacheFromBlocks(
  block3?: Uint8Array,
  block13?: Uint8Array,
  block2?: Uint8Array,
  documentUuid?: string,
  block28?: Uint8Array,
): SnapGeneEnzymeCache | undefined {
  if (!block3 && !block13 && !block2 && !documentUuid && !block28) return undefined
  const enzymeSetName = block13 ? parseSnapGeneBlock13EnzymeSetName(block13) ?? undefined : undefined
  const hiddenEnzymeNames = block28 ? parseSnapGeneEnzymeVisibilityBlock(block28) : undefined
  return {
    documentUuid,
    enzymeSetName,
    block2: block2 ? block2.slice() : undefined,
    block3: block3 ? block3.slice() : undefined,
    block13: block13 ? block13.slice() : undefined,
    hiddenEnzymeNames,
  }
}

/** SnapGene block 0x1c stores comma-separated enzymeName:visibility entries; 0 means hidden. */
export function parseSnapGeneEnzymeVisibilityBlock(block28: Uint8Array): string[] {
  const xml = new TextDecoder().decode(block28)
  const vals = xml.match(/\bvals\s*=\s*(["'])(.*?)\1/i)?.[2]
  if (vals == null) return []
  return [...new Set(vals.split(',').flatMap((entry) => {
    const separator = entry.lastIndexOf(':')
    if (separator < 1 || entry.slice(separator + 1).trim() !== '0') return []
    return [entry.slice(0, separator).trim()
      .replaceAll('&quot;', '"').replaceAll('&apos;', "'")
      .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')]
  }).filter(Boolean))]
}

export function snapGeneEnzymeCacheForSequence(
  cache: SnapGeneEnzymeCache | undefined,
  sequenceLength: number,
): SnapGeneEnzymeCache | undefined {
  if (!cache) return undefined
  return {
    ...cache,
    cachedSequenceLength: sequenceLength,
  }
}

export function resolveSnapGeneBlock2ForExport(record: SequenceRecord): Uint8Array {
  return record.snapGeneEnzymes?.block2?.slice() ?? pdemoEnzymeBlock2()
}

export function resolveSnapGeneBlock3ForExport(record: SequenceRecord): Uint8Array {
  const cache = record.snapGeneEnzymes
  if (
    cache?.block3?.length &&
    cache.cachedSequenceLength === record.sequence.length
  ) {
    return cache.block3.slice()
  }
  return pdemoEnzymeBlock3Full().slice()
}

export function snapGeneExportOptionsFromEnzymeDisplay(
  enzymeDisplay: {
    set: VibegeneSnapGeneEnzymePreset | 'custom' | 'supplier'
    supplierSetId: EnzymeManufacturerId | null
    hiddenNames?: string[]
    selectedNames?: string[]
  },
  _record: SequenceRecord,
): SnapGeneExportOptions {
  void _record
  return {
    ...defaultSnapGeneExportOptions(),
    enzymeSet: vibegeneEnzymePresetToSnapGeneSet(enzymeDisplay.set),
    // Let SnapGene calculate enzyme sites for this sequence instead of writing
    // a stale or pDemo-derived analysis cache.
    enzymeCache: 'none',
    block13Source: 'default',
    hiddenEnzymeNames: [...(enzymeDisplay.hiddenNames ?? [])],
    ...(enzymeDisplay.set === 'custom' ? { customEnzymeNames: [...(enzymeDisplay.selectedNames ?? [])] }
      : enzymeDisplay.set === 'type-iis' ? { customEnzymeNames: enzymes.filter(isTypeIisEnzyme).map((enzyme) => enzyme.name) } : {}),
  }
}

export function serializeSnapGeneEnzymeCacheForJson(cache?: SnapGeneEnzymeCache): SnapGeneEnzymeCacheJson | undefined {
  if (!cache) return undefined
  return {
    documentUuid: cache.documentUuid,
    enzymeSetName: cache.enzymeSetName,
    cachedSequenceLength: cache.cachedSequenceLength,
    block2Base64: cache.block2 ? bytesToBase64(cache.block2) : undefined,
    block3Base64: cache.block3 ? bytesToBase64(cache.block3) : undefined,
    block13Base64: cache.block13 ? bytesToBase64(cache.block13) : undefined,
    hiddenEnzymeNames: cache.hiddenEnzymeNames ? [...cache.hiddenEnzymeNames] : undefined,
  }
}

export function deserializeSnapGeneEnzymeCacheFromJson(json?: SnapGeneEnzymeCacheJson): SnapGeneEnzymeCache | undefined {
  if (!json) return undefined
  return {
    documentUuid: json.documentUuid,
    enzymeSetName: json.enzymeSetName,
    cachedSequenceLength: json.cachedSequenceLength,
    block2: json.block2Base64 ? base64ToBytes(json.block2Base64) : undefined,
    block3: json.block3Base64 ? base64ToBytes(json.block3Base64) : undefined,
    block13: json.block13Base64 ? base64ToBytes(json.block13Base64) : undefined,
    hiddenEnzymeNames: json.hiddenEnzymeNames ? [...json.hiddenEnzymeNames] : undefined,
  }
}

export type VibegeneEnzymeDisplayImport = {
  set: VibegeneSnapGeneEnzymePreset | 'custom'
  supplierSetId?: EnzymeManufacturerId | null
  selectedNames?: string[]
  unavailableNames?: string[]
}

export function vibegeneEnzymeDisplayFromSnapGeneRecord(record: SequenceRecord): VibegeneEnzymeDisplayImport | null {
  const name = record.snapGeneEnzymes?.enzymeSetName
  if (!name) return null
  const fileSet = record.fileEnzymeSets?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
  if (fileSet) {
    const known = new Set(enzymes.map((enzyme) => enzyme.name.toLowerCase()))
    const unavailableNames = fileSet.enzymeNames.filter((enzymeName) => !known.has(enzymeName.toLowerCase()))
    return { set: 'custom', selectedNames: [...fileSet.enzymeNames], ...(unavailableNames.length ? { unavailableNames } : {}) }
  }
  const set = snapGeneEnzymeSetNameToVibegenePreset(name)
  if (!set) return null
  return { set }
}
