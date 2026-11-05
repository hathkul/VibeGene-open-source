import { normalizeProteinDocumentData } from './constructProperties'
import { parseFeatureQualifiers, serializeFeatureQualifiers } from './featureQualifiers'
import {
  encodeSnapGeneAttachmentPackets,
  findSnapGeneAttachment,
  parseSnapGeneAttachments,
  VIBEGENE_ATTACHMENT_FILE_NAME,
} from './snapgeneAttachments'
import {
  exportSnapGeneFeaturesXmlNative,
  exportSnapGeneNotesXmlNative,
  SNAPGENE_COOKIE_EXPORT_VERSION,
  SNAPGENE_COOKIE_IMPORT_VERSION,
} from './snapgeneNativeExport'
import { exportSnapGeneHistoryTreeXml, prepareExportHistory, snapGeneHistoryTreeFingerprint } from './snapgeneHistoryExport'
import {
  snapGeneNativeNodePayloadsForExport,
} from './snapgeneNativeHistory'
import { sequenceRecordJsonReplacer, sequenceRecordJsonReviver } from './sequenceRecordJson'
import { compressSnapGeneXmlToXz } from './snapgeneLzma'
import { createId } from './sequence'
import { defaultProteinBondColor, proteinBondStrokeWidth } from './proteinBonds'
import type {
  ProteinBond,
  ProteinBondType,
  ProteinDocumentData,
  SequenceFeature,
  SequenceRecord,
} from './types'

export const VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA = 'vibegene-snapgene-attachment' as const
export const VIBEGENE_SNAPGENE_ATTACHMENT_VERSION = 3 as const

export type VibegeneSnapgeneAttachmentPayload = {
  schema: typeof VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA
  schemaVersion: typeof VIBEGENE_SNAPGENE_ATTACHMENT_VERSION
  protein: ProteinDocumentData
  derivation?: ProteinDocumentData['translationDerivation']
}

const SNAPGENE_BOND_TYPE_TO_VIBEGENE: Record<string, ProteinBondType> = {
  disulfide: 'disulfide',
  disulphide: 'disulfide',
  thioether: 'thioether',
  thiolester: 'thiolester',
  thioester: 'thiolester',
  'x-link': 'cross-link',
  xlink: 'cross-link',
  'cross-link': 'cross-link',
  crosslink: 'cross-link',
  other: 'other',
}

const VIBEGENE_BOND_TYPE_TO_SNAPGENE: Record<ProteinBondType, string> = {
  disulfide: 'disulfide',
  thioether: 'thioether',
  thiolester: 'thiolester',
  'cross-link': 'x-link',
  other: 'other',
}

function snapGenePacket(type: number, payload: Uint8Array) {
  const packet = new Uint8Array(5 + payload.length)
  packet[0] = type
  new DataView(packet.buffer).setUint32(1, payload.length, false)
  packet.set(payload, 5)
  return packet
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export function isSnapGeneBondFeature(feature: Pick<SequenceFeature, 'type'>): boolean {
  return feature.type.trim().toLowerCase() === 'bond'
}

export function snapGeneBondTypeFromText(value: string | undefined): ProteinBondType {
  if (!value?.trim()) return 'other'
  const normalized = value.trim().toLowerCase()
  for (const [key, type] of Object.entries(SNAPGENE_BOND_TYPE_TO_VIBEGENE)) {
    if (normalized === key || normalized.includes(key)) return type
  }
  return 'other'
}

/** Convert a VibeGene bond into a SnapGene-readable Bond feature. */
export function proteinBondToSnapGeneFeature(bond: ProteinBond): SequenceFeature | null {
  const localResidues = bond.endpoints
    .filter((endpoint) => !endpoint.chainId)
    .map((endpoint) => endpoint.residue)
    .sort((left, right) => left - right)
  if (!localResidues.length) return null
  const start = localResidues[0]!
  const endExclusive = localResidues.length === 1
    ? start + 1
    : localResidues[localResidues.length - 1]! + 1
  if (endExclusive <= start) return null
  const color = bond.color?.trim() || defaultProteinBondColor(bond.type)
  const qualifiers: Record<string, string> = {
    bond_type: VIBEGENE_BOND_TYPE_TO_SNAPGENE[bond.type],
  }
  if (bond.notes?.trim()) {
    const existing = parseFeatureQualifiers(bond.notes)
    if (Object.keys(existing).length) {
      for (const [key, value] of Object.entries(existing)) {
        if (key === 'bond_type' || !value.trim()) continue
        qualifiers[key] = value
      }
    } else {
      qualifiers.note = bond.notes.trim()
    }
  }
  return {
    id: bond.id || createId('bond-feature'),
    name: bond.name?.trim() || 'Bond',
    type: 'Bond',
    color,
    notes: serializeFeatureQualifiers(qualifiers),
    visible: bond.visible === false ? false : undefined,
    locations: [{ start, end: endExclusive, strand: 'forward' }],
  }
}

/** Convert SnapGene Bond features into VibeGene protein bonds. */
export function snapGeneBondFeaturesToProteinBonds(
  features: readonly SequenceFeature[],
): ProteinBond[] {
  return features.flatMap((feature) => {
    if (!isSnapGeneBondFeature(feature)) return []
    const residues = feature.locations
      .flatMap((location) => [location.start, Math.max(location.start, location.end - 1)])
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort((left, right) => left - right)
    if (!residues.length) return []
    const first = residues[0]!
    const second = residues.length === 1 ? first : residues[residues.length - 1]!
    const qualifiers = parseFeatureQualifiers(feature.notes)
    const type = snapGeneBondTypeFromText(
      qualifiers.bond_type || qualifiers.note || feature.name,
    )
    const noteText = qualifiers.note?.trim()
    return [{
      id: feature.id || createId('bond'),
      name: feature.name?.trim() || noteText || 'Bond',
      type,
      endpoints: [{ residue: first }, { residue: second }],
      color: feature.color || defaultProteinBondColor(type),
      strokeWidth: proteinBondStrokeWidth({}),
      visible: feature.visible === false ? false : undefined,
      ...(noteText && noteText !== feature.name ? { notes: noteText } : {}),
    }]
  })
}

export function proteinFeaturesWithoutBonds(
  features: readonly SequenceFeature[],
): SequenceFeature[] {
  return features.filter((feature) => !isSnapGeneBondFeature(feature))
}

export function buildVibegeneSnapgeneAttachmentPayload(
  record: SequenceRecord,
): VibegeneSnapgeneAttachmentPayload {
  const normalized = normalizeProteinDocumentData(record.protein, record.sequence.length)
  const { translationDerivation, ...protein } = normalized
  return {
    schema: VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
    schemaVersion: VIBEGENE_SNAPGENE_ATTACHMENT_VERSION,
    protein,
    ...(translationDerivation
      ? { derivation: translationDerivation }
      : {}),
  }
}

export function parseVibegeneSnapgeneAttachmentPayload(
  bytes: Uint8Array,
  sequenceLength: number,
): VibegeneSnapgeneAttachmentPayload | null {
  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(bytes),
      sequenceRecordJsonReviver,
    ) as {
      schema?: unknown
      schemaVersion?: unknown
      protein?: Partial<ProteinDocumentData>
      derivation?: ProteinDocumentData['translationDerivation']
    }
    if (parsed.schema !== VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA) return null
    if (
      parsed.schemaVersion !== 1
      && parsed.schemaVersion !== 2
      && parsed.schemaVersion !== VIBEGENE_SNAPGENE_ATTACHMENT_VERSION
    ) return null
    if (!parsed.protein || typeof parsed.protein !== 'object') return null
    const baseProtein = normalizeProteinDocumentData(parsed.protein, sequenceLength)
    let protein = baseProtein
    if (parsed.derivation) {
      try {
        protein = normalizeProteinDocumentData({
          ...parsed.protein,
          translationDerivation: parsed.derivation,
        }, sequenceLength)
      } catch {
        // Keep valid protein metadata even if optional provenance is damaged.
      }
    }
    return {
      schema: VIBEGENE_SNAPGENE_ATTACHMENT_SCHEMA,
      schemaVersion: VIBEGENE_SNAPGENE_ATTACHMENT_VERSION,
      protein,
      ...(protein.translationDerivation ? { derivation: protein.translationDerivation } : {}),
    }
  } catch {
    return null
  }
}

/**
 * Merge SnapGene Bond features + optional VibeGene attachment into one protein
 * document. Attachment bonds win when present (preserve UI metadata). Bond
 * features are stripped from `features` so the UI never shows duplicates.
 */
export function hydrateSnapGeneProteinRecord(
  record: SequenceRecord,
  attachmentBlocks: readonly Uint8Array[] = [],
): SequenceRecord {
  if (record.molecule !== 'protein') return record

  const bondFeatures = record.features.filter(isSnapGeneBondFeature)
  const nonBondFeatures = proteinFeaturesWithoutBonds(record.features)
  const snapGeneBonds = snapGeneBondFeaturesToProteinBonds(bondFeatures)

  const namedAttachment = findSnapGeneAttachment(attachmentBlocks, VIBEGENE_ATTACHMENT_FILE_NAME)
  let attachmentPayload = namedAttachment
    ? parseVibegeneSnapgeneAttachmentPayload(namedAttachment.data, record.sequence.length)
    : null
  if (!attachmentPayload) {
    // Manifest may be missing (corrupt/partial file); recover by schema sniff.
    for (const file of parseSnapGeneAttachments(attachmentBlocks)) {
      attachmentPayload = parseVibegeneSnapgeneAttachmentPayload(file.data, record.sequence.length)
      if (attachmentPayload) break
    }
  }

  let protein = attachmentPayload
    ? attachmentPayload.protein
    : normalizeProteinDocumentData(
      {
        ...(record.protein ?? {}),
        bonds: snapGeneBonds.length ? snapGeneBonds : record.protein?.bonds ?? [],
      },
      record.sequence.length,
    )

  if (attachmentPayload && protein.bonds.length === 0 && snapGeneBonds.length > 0) {
    protein = { ...protein, bonds: snapGeneBonds }
  }

  return {
    ...record,
    features: nonBondFeatures,
    protein,
  }
}

function exportProteinFeaturesXml(record: SequenceRecord): string {
  const bondFeatures = (record.protein?.bonds ?? [])
    .map(proteinBondToSnapGeneFeature)
    .filter((feature): feature is SequenceFeature => Boolean(feature))
  const exportRecord: SequenceRecord = {
    ...record,
    features: [...proteinFeaturesWithoutBonds(record.features), ...bondFeatures],
  }
  return exportSnapGeneFeaturesXmlNative(exportRecord)
}

/**
 * Write a SnapGene `.prot` document: protein sequence block 0x15, features
 * (including SnapGene Bond features), notes/history, and a VibeGene JSON attachment.
 */
export function exportSnapGeneProtein(record: SequenceRecord): Uint8Array {
  if (record.molecule !== 'protein') {
    throw new Error('exportSnapGeneProtein requires a protein record')
  }

  const encoder = new TextEncoder()
  const cookie = new Uint8Array(14)
  cookie.set(encoder.encode('SnapGene'), 0)
  const cookieView = new DataView(cookie.buffer)
  cookieView.setUint16(8, 2, false) // protein
  cookieView.setUint16(10, SNAPGENE_COOKIE_EXPORT_VERSION, false)
  cookieView.setUint16(12, SNAPGENE_COOKIE_IMPORT_VERSION, false)

  const sequenceBytes = encoder.encode(record.sequence)
  // Match SnapGene protein flags observed on disk: double-stranded linear.
  const sequencePayload = new Uint8Array(sequenceBytes.length + 1)
  sequencePayload[0] = 0x02
  sequencePayload.set(sequenceBytes, 1)

  const notesXml = exportSnapGeneNotesXmlNative(record, true)
  const featuresXml = exportProteinFeaturesXml(record)
  const exportHistory = prepareExportHistory(record)
  const currentHistoryFingerprint = exportHistory
    ? snapGeneHistoryTreeFingerprint(record)
    : undefined
  const nativeHistory = record.snapGeneNativeHistory
  const nativeTreePayload =
    nativeHistory?.treePayload && (
      !exportHistory || nativeHistory.treeFingerprint === currentHistoryFingerprint
    )
      ? nativeHistory.treePayload
      : undefined
  const historyPacket = exportHistory || nativeTreePayload
    ? snapGenePacket(
        0x07,
        nativeTreePayload ?? compressSnapGeneXmlToXz(exportSnapGeneHistoryTreeXml(exportHistory!, 'protein')),
      )
    : null
  const nativeHistoryNodePackets = exportHistory || nativeHistory
    ? snapGeneNativeNodePayloadsForExport(nativeHistory, exportHistory, currentHistoryFingerprint)
        .map((payload) => snapGenePacket(0x0b, payload))
    : []

  const attachmentPayload = buildVibegeneSnapgeneAttachmentPayload(record)
  const attachmentBytes = encoder.encode(
    `${JSON.stringify(attachmentPayload, sequenceRecordJsonReplacer, 2)}\n`,
  )
  const attachmentPackets = encodeSnapGeneAttachmentPackets([
    {
      name: VIBEGENE_ATTACHMENT_FILE_NAME,
      data: attachmentBytes,
      compressible: true,
    },
  ])

  return concatBytes([
    snapGenePacket(0x09, cookie),
    snapGenePacket(0x15, sequencePayload),
    snapGenePacket(0x06, encoder.encode(notesXml)),
    snapGenePacket(0x0a, encoder.encode(featuresXml)),
    ...nativeHistoryNodePackets,
    ...(historyPacket ? [historyPacket] : []),
    ...attachmentPackets,
  ])
}
