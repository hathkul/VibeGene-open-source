import { defaultConstructProperties, effectiveHostMethylation } from './constructProperties'
import { exportSnapGeneBlock8Xml, resolveDnaEnds } from './dnaEnds'
import { pdemoEnzymeBlock2, pdemoEnzymeBlock3Full, pdemoEnzymeBlock3Prefix } from './snapgeneEnzymeCacheTemplates'
import {
  parseSnapGeneBlock13EnzymeSetName,
  resolveSnapGeneBlock3ForExport,
  snapGeneEnzymeSetNameToVibegenePreset,
  vibegeneEnzymePresetToSnapGeneSet,
} from './snapgeneEnzymeData'
import { serializeCustomEnzymeSetsXml } from './snapgeneCustomEnzymeSets'
import type { SequenceRecord } from './types'
import type { PrimerHybridizationParams } from './primerHybridization'

export type SnapGeneEnzymeSet = 'unique-6-plus' | 'six-plus' | 'all-commercial' | 'unique-cutters'

export type SnapGeneEnzymeCacheMode =
  | 'none'
  | 'round-trip'
  | 'pdemo-blocks-2-3'
  /** Full block 3 from SnapGene-saved pDemo — enables restriction sites on open. */
  | 'pdemo-block-3'
  | 'block-3-prefix'
  | 'block-3-minimal'

/** Default SnapGene export options. SnapGene should calculate sites from the exported sequence. */
export function defaultSnapGeneExportOptions(): SnapGeneExportOptions {
  return {
    // Block 3 is a sequence-specific analysis cache. When a record has no valid
    // cache, the legacy fallback is pDemo's cache, which makes SnapGene show
    // misplaced sites for only part of an unrelated sequence.
    enzymeCache: 'none',
    enzymeSet: 'unique-6-plus',
    // Keep mixed case (e.g. uppercase selections / overhang edits). Forcing
    // 'lower' made every reopen look uniformly lowercase.
    sequenceCase: 'preserve',
    // Derive circular/linear + methylation from the record. A fixed 0x1f forced
    // the circular bit and made every saved linear .dna reopen as circular.
    dnaFlags: 'auto',
    omitEnzymeAuxBlocks: false,
    snapGenePacketOrder: true,
    snapGeneModernFormat: true,
    block13Source: 'default',
    includeHistory: true,
    includeStrandColors: false,
  }
}

export type SnapGeneExportOptions = {
  sequenceCase?: 'preserve' | 'lower' | 'upper'
  dnaFlags?: 'auto' | 'circular-only' | 'linear-only' | number
  enzymeBlocks?: boolean
  enzymeSet?: SnapGeneEnzymeSet
  /** SnapGene blocks 2/3 enzyme analysis caches (from pDemo reference or synthesized). */
  enzymeCache?: SnapGeneEnzymeCacheMode
  /** Use block 13 bytes from SnapGene-saved pDemo (input).dna instead of our template. */
  block13Source?: 'default' | 'pdemo-input'
  /** Omit block 14 (CustomEnzymeSets). Block 28 (EnzymeVisibilities) is included in modern format. */
  omitEnzymeAuxBlocks?: boolean
  /** Match SnapGene 8.x packet layout, cookie versions, and XML (blocks 2, 11, 28, etc.). */
  snapGeneModernFormat?: boolean
  /** Match packet order in SnapGene-saved files (9,0,2,3,11,8,10,5,6,13,28,…). */
  snapGenePacketOrder?: boolean
  includeHistory?: boolean
  includeStrandColors?: boolean
  includeTraces?: boolean
  /** App-wide primer hybridization thresholds written into the Primers XML block. */
  primerHybridization?: PrimerHybridizationParams
  /** Enzymes to serialize as hidden in SnapGene's EnzymeVisibilities block (0x1c). */
  hiddenEnzymeNames?: string[]
  /** Current custom selection, stored as SnapGene's per-document unsaved set. */
  customEnzymeNames?: string[]
}

export type SnapGeneExportPacket = {
  type: number
  payload: Uint8Array
}

const BLOCK_13_HEX: Record<SnapGeneEnzymeSet, string> = {
  'unique-6-plus':
    '000000000100004b00000000000000000003556e6971756520362b20437574746572730000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000019ff0064000000000054444f00fffe000000000000000000000000010100010100004500000000000000000001000001000001ffffffff015901f401013f00500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  'all-commercial':
    '000001000100004b00000000000000000000416c6c20436f6d6d65726369616c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000484f000064000000000000000000000000010101010001004500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  'six-plus':
    '000000000100004b00000000000000000002362b2043757474657273000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000484f000064000000000000000000000000010101010001004500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  'unique-cutters':
    '010001000100004b0000000000000000000a556e6971756520437574746572730000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000444f000064000000000000000000000000010101010101004500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
}

const BLOCK_14_XML = '<?xml version="1.0"?><CustomEnzymeSets/>'

function enzymeVisibilityXml(names: string[]): string {
  const vals = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .map((name) => `${name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}:0`)
    .join(',')
  return `<?xml version="1.0"?><EnzymeVisibilities vals="${vals}"/>`
}

// SnapGene 0x0d bytes identified by controlled open-in-SnapGene comparisons:
// byte 155 enables restriction enzymes on initial open; byte 170 selects the
// initial map view (0 for circular, 1 for linear). Keep these independent of
// the molecule topology flag in DNA block 0.
const BLOCK_13_ENZYMES_VISIBLE_ON_OPEN_OFFSET = 155
const BLOCK_13_MAP_VIEW_ON_OPEN_OFFSET = 170

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const BLOCK_13_BY_SET = Object.fromEntries(
  Object.entries(BLOCK_13_HEX).map(([key, hex]) => {
    const bytes = hexToBytes(hex)
    if (bytes.length !== 345) {
      throw new Error(`SnapGene enzyme block 13 template "${key}" must be 345 bytes, got ${bytes.length}`)
    }
    return [key, bytes]
  }),
) as Record<SnapGeneEnzymeSet, Uint8Array>

function emptyRecordForEnzymeExport(): SequenceRecord {
  return {
    id: '',
    name: '',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence: '',
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

/** SnapGene DNA block 0 flags: topology + double-stranded + host methylation. */
export function snapGeneDnaFlags(record: SequenceRecord): number {
  let flags = 0x02
  if (record.topology === 'circular') flags |= 0x01
  const methylation = effectiveHostMethylation(record.construct)
  if (methylation.dam) flags |= 0x04
  if (methylation.dcm) flags |= 0x08
  if (methylation.ecoKI) flags |= 0x10
  return flags
}

export function resolveSnapGeneDnaFlags(
  record: SequenceRecord,
  mode: SnapGeneExportOptions['dnaFlags'] = 'auto',
): number {
  if (typeof mode === 'number') return mode
  if (mode === 'circular-only') return record.topology === 'circular' ? 0x01 : 0x00
  if (mode === 'linear-only') return 0x02
  return snapGeneDnaFlags(record)
}

export function resolveSnapGeneExportSequence(record: SequenceRecord, options: SnapGeneExportOptions = {}): string {
  if (options.sequenceCase === 'lower') return record.sequence.toLowerCase()
  if (options.sequenceCase === 'upper') return record.sequence.toUpperCase()
  return record.sequence
}

export function snapGeneEnzymeBlock13(
  enzymeSet: SnapGeneEnzymeSet = 'unique-6-plus',
  record?: SequenceRecord,
  customSelection = false,
): Uint8Array {
  let payload = BLOCK_13_BY_SET[enzymeSet]
  const cached = record?.snapGeneEnzymes?.block13
  if (cached?.length === 345) {
    const name = parseSnapGeneBlock13EnzymeSetName(cached)
    const preset = name ? snapGeneEnzymeSetNameToVibegenePreset(name) : null
    if ((customSelection && name === 'Unsaved Enzyme Set') || (!customSelection && preset && vibegeneEnzymePresetToSnapGeneSet(preset) === enzymeSet)) {
      payload = cached
    }
  }

  // Normalize only the two presentation flags that SnapGene otherwise reads
  // from older VibeGene-style packets. Preserve all other imported settings.
  const normalized = payload.slice()
  if (customSelection) {
    const name = new TextEncoder().encode('Unsaved Enzyme Set')
    normalized[0] = 0x03
    normalized[17] = 0x07
    normalized.fill(0, 18, 18 + name.length + 1)
    normalized.set(name, 18)
  }
  normalized[BLOCK_13_ENZYMES_VISIBLE_ON_OPEN_OFFSET] = 0x01
  normalized[BLOCK_13_MAP_VIEW_ON_OPEN_OFFSET] = record?.topology === 'linear' ? 0x01 : 0x00
  return normalized
}

function buildBlock3Minimal(): Uint8Array {
  const prefix = pdemoEnzymeBlock3Prefix()
  const section1Length = new DataView(prefix.buffer, prefix.byteOffset + 1, 4).getUint32(0, false)
  const section1 = prefix.slice(0, 5 + section1Length)
  const emptySection2 = new Uint8Array(5)
  const output = new Uint8Array(section1.length + emptySection2.length)
  output.set(section1, 0)
  output.set(emptySection2, section1.length)
  return output
}

export function snapGeneEnzymeCachePackets(
  mode: SnapGeneEnzymeCacheMode = 'none',
  record?: SequenceRecord,
): SnapGeneExportPacket[] {
  switch (mode) {
    case 'round-trip': {
      // Synthetic/pDemo block 2 is sequence-specific and makes SnapGene Gateway treat
      // circular plasmids as linear. Only round-trip a real imported block 2.
      const packets: SnapGeneExportPacket[] = []
      const cachedBlock2 = record?.snapGeneEnzymes?.block2
      if (cachedBlock2?.length) {
        packets.push({ type: 0x02, payload: cachedBlock2.slice() })
      }
      packets.push({
        type: 0x03,
        payload: resolveSnapGeneBlock3ForExport(record ?? emptyRecordForEnzymeExport()),
      })
      return packets
    }
    case 'pdemo-blocks-2-3':
      return [
        { type: 0x02, payload: pdemoEnzymeBlock2() },
        { type: 0x03, payload: pdemoEnzymeBlock3Full() },
      ]
    case 'pdemo-block-3':
      return [{ type: 0x03, payload: pdemoEnzymeBlock3Full() }]
    case 'block-3-prefix':
      return [{ type: 0x03, payload: pdemoEnzymeBlock3Prefix() }]
    case 'block-3-minimal':
      return [{ type: 0x03, payload: buildBlock3Minimal() }]
    default:
      return []
  }
}

export function snapGeneEnzymeDisplayPackets(
  encoder: TextEncoder,
  options: Pick<SnapGeneExportOptions, 'enzymeSet' | 'omitEnzymeAuxBlocks' | 'snapGeneModernFormat' | 'hiddenEnzymeNames' | 'customEnzymeNames'> & { block8Xml?: string },
  record?: SequenceRecord,
): SnapGeneExportPacket[] {
  const enzymeSet = options.enzymeSet ?? 'unique-6-plus'
  const includeVisibilities = options.snapGeneModernFormat ? true : !options.omitEnzymeAuxBlocks
  const existingSets = record?.fileEnzymeSets ?? []
  const importedActiveSet = options.enzymeSet === undefined
    ? existingSets.find((set) => set.name === record?.snapGeneEnzymes?.enzymeSetName)
    : undefined
  const customNames = options.customEnzymeNames ?? importedActiveSet?.enzymeNames
  const fileSets = customNames === undefined ? existingSets : [
    ...existingSets.filter((set) => set.name !== 'Unsaved Enzyme Set'),
    { id: 'snapgene-unsaved', name: 'Unsaved Enzyme Set', enzymeNames: customNames },
  ]
  const ends = resolveDnaEnds(record ?? emptyRecordForEnzymeExport())
  const isDefaultEnds = (side: typeof ends.upstream) => side.stickiness === 0
    && side.modification === 'fivePrimePhosphorylated' && !side.enzymeName
  // Preserve the distinction between an imported linear file with no block 8
  // and one that explicitly recorded blunt, phosphorylated end chemistry.
  const writeEndProperties = record?.topology !== 'linear' || Boolean(record.dnaEndsProvenance)
    || !isDefaultEnds(ends.upstream) || !isDefaultEnds(ends.downstream)
  const packets: SnapGeneExportPacket[] = [
    ...(writeEndProperties ? [{
      type: 0x08,
      payload: encoder.encode(options.block8Xml ?? exportSnapGeneBlock8Xml(ends)),
    }] : []),
    { type: 0x0d, payload: snapGeneEnzymeBlock13(enzymeSet, record, customNames !== undefined) },
  ]
  if (includeVisibilities) {
    packets.push({
      type: 0x1c,
      payload: encoder.encode(enzymeVisibilityXml(options.hiddenEnzymeNames ?? record?.snapGeneEnzymes?.hiddenEnzymeNames ?? [])),
    })
  }
  if (fileSets.length > 0) {
    packets.push({
      type: 0x0e,
      payload: encoder.encode(serializeCustomEnzymeSetsXml(fileSets)),
    })
  } else if (!options.omitEnzymeAuxBlocks && !options.snapGeneModernFormat) {
    packets.push({ type: 0x0e, payload: encoder.encode(BLOCK_14_XML) })
  }
  return packets
}

export function snapGeneEnzymeExportPackets(
  encoder: TextEncoder,
  options: Pick<SnapGeneExportOptions, 'enzymeSet' | 'omitEnzymeAuxBlocks' | 'enzymeCache' | 'snapGeneModernFormat'> = {},
  record?: SequenceRecord,
): SnapGeneExportPacket[] {
  return [
    ...snapGeneEnzymeCachePackets(options.enzymeCache ?? 'none', record),
    ...snapGeneEnzymeDisplayPackets(encoder, options, record),
  ]
}
