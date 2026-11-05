import { formatHybridizationParamsXml, defaultPrimerHybridizationParams, normalizePrimerHybridizationParams } from './primerHybridization'
import { featureDirectionality } from './featureDirectionality'
import type { HistoryNode, MoleculeType, SequenceRecord } from './types'
import { encodeSnapGeneAlignmentPackets } from "./snapgeneTraces"
import { exportSnapGeneTranslationQualifiers, formatSnapGeneCleavageArrows, snapGeneFeatureTranslationAttrs, snapGeneSegmentTranslatedAttr } from "./snapgeneFeatureTranslation"
import { exportSnapGeneBlock8XmlNative, exportSnapGeneFeaturesXmlNative, exportSnapGeneFeatureQualifiersXml, exportSnapGeneNotesXmlNative, exportSnapGenePrimersXmlNative, SNAPGENE_ALIGNABLE_SEQUENCES_EMPTY_XML, SNAPGENE_COOKIE_EXPORT_VERSION, SNAPGENE_COOKIE_IMPORT_VERSION, SNAPGENE_COOKIE_LEGACY_EXPORT_VERSION, SNAPGENE_COOKIE_LEGACY_IMPORT_VERSION, snapGeneExportFeatures } from "./snapgeneNativeExport"
import { resolveSnapGeneDnaFlags, resolveSnapGeneExportSequence, snapGeneEnzymeCachePackets, snapGeneEnzymeDisplayPackets, type SnapGeneExportOptions } from "./snapgeneEnzymeExport"
import { exportSnapGeneHistoryTreeXml, normalizeSnapGeneHistoryNodeIds, prepareExportHistory, snapGeneHistoryTreeFingerprint } from "./snapgeneHistoryExport"
import { snapGeneNativeNodePayloadsForExport } from "./snapgeneNativeHistory"
import { compressSnapGeneBytesToXz, compressSnapGeneXmlToXz } from "./snapgeneLzma"
import { exportSnapGeneStrandColorsXml } from "./snapgeneStrandColors"
import { exportSnapGeneProtein } from "./snapgeneProtein"
import { encodeDnaComparisonAttachmentPackets } from "./snapgeneDnaComparison"
import { escapeSnapGenePrimerDescription } from './snapgenePrimerDescription'
function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
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
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function historySequenceNodePayload(node: HistoryNode, molecule: MoleculeType, encoder: TextEncoder) {
  if (node.sequence === undefined) return null
  const numericId = Number(node.id)
  if (!Number.isInteger(numericId) || numericId <= 0 || numericId > 0xffffffff) return null

  const id = new Uint8Array(4)
  new DataView(id.buffer).setUint32(0, numericId, false)
  if (molecule === 'rna') {
    return concatBytes([id, snapGenePacket(0x20, encoder.encode(node.sequence.replace(/T/g, 'U')))])
  }
  const bases = encoder.encode(node.sequence)
  const dna = new Uint8Array(bases.byteLength + 1)
  dna[0] = node.circular ? 0x01 : 0x00
  dna.set(bases, 1)
  const tracePackets = encodeSnapGeneAlignmentPackets(node.traceFiles ?? [])
  const traceBlock = tracePackets.length ? [snapGenePacket(0x1e, compressSnapGeneBytesToXz(concatBytes(tracePackets)))] : []
  return concatBytes([id, snapGenePacket(0x00, dna), ...traceBlock])
}

function generatedHistoryNodePayloads(
  root: HistoryNode,
  molecule: MoleculeType,
  encoder: TextEncoder,
  nativePayloads: readonly Uint8Array[],
) {
  const existingIds = new Set(nativePayloads.flatMap((payload) => (
    payload.byteLength >= 4
      ? [new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, false)]
      : []
  )))
  const generated: Uint8Array[] = []
  const visit = (node: HistoryNode) => {
    const numericId = Number(node.id)
    if (!existingIds.has(numericId)) {
      const payload = historySequenceNodePayload(node, molecule, encoder)
      if (payload) generated.push(payload)
    }
    node.children.forEach(visit)
  }
  // The root is represented by the document's top-level sequence packet.
  root.children.forEach(visit)
  return generated
}

export function exportSnapGene(record: SequenceRecord, options: SnapGeneExportOptions = {}) {
  if (record.molecule === 'protein') return exportSnapGeneProtein(record)

  const encoder = new TextEncoder()
  const modern = options.snapGeneModernFormat ?? options.snapGenePacketOrder ?? false
  const cookie = new Uint8Array(14)
  cookie.set(encoder.encode('SnapGene'), 0)
  const cookieView = new DataView(cookie.buffer)
  cookieView.setUint16(8, 1, false)
  if (options.snapGenePacketOrder) {
    cookieView.setUint16(10, modern ? SNAPGENE_COOKIE_EXPORT_VERSION : SNAPGENE_COOKIE_LEGACY_EXPORT_VERSION, false)
    cookieView.setUint16(12, modern ? SNAPGENE_COOKIE_IMPORT_VERSION : SNAPGENE_COOKIE_LEGACY_IMPORT_VERSION, false)
  } else {
    cookieView.setUint16(10, 15, false)
    cookieView.setUint16(12, 15, false)
  }

  const sequence = resolveSnapGeneExportSequence(record, options)
  const sequenceBytes = encoder.encode(sequence)
  const dnaPayload = new Uint8Array(sequenceBytes.length + 1)
  dnaPayload[0] = resolveSnapGeneDnaFlags(record, options.dnaFlags)
  dnaPayload.set(sequenceBytes, 1)

  const notesXml = options.snapGenePacketOrder
    ? exportSnapGeneNotesXmlNative(record, modern)
    : `<Notes><Type>Synthetic</Type><Description>${xmlEscape(record.description || record.name)}</Description><Comments>${xmlEscape(record.name)}</Comments><CustomMapLabel>${xmlEscape(record.mapLabel?.trim() || record.name)}</CustomMapLabel></Notes>`
  const featuresXml = options.snapGenePacketOrder
    ? exportSnapGeneFeaturesXmlNative(record)
    : `<Features>${snapGeneExportFeatures(record)
    .map((feature) => {
      const directionality = ({ none: 0, forward: 1, reverse: 2, both: 3 } as const)[featureDirectionality(feature)]
      const translationAttrs = snapGeneFeatureTranslationAttrs(feature)
      const segments = feature.locations
        .map((location) => `<Segment range="${location.start + 1}-${location.end}" color="${xmlEscape(feature.color)}" type="standard"${snapGeneSegmentTranslatedAttr(feature)}/>`)
        .join('')
      const translationQualifiers = exportSnapGeneTranslationQualifiers(feature, record.sequence, record.topology)
      const consecutiveNumberingAttr = feature.translateInSequenceView ? '' : ' consecutiveTranslationNumbering="1"'
      const cleavage = formatSnapGeneCleavageArrows(feature.cleavageArrows)
      const cleavageAttr = cleavage ? ` cleavageArrows="${cleavage}"` : ''
      const visibleAttr = feature.visible === false ? ' visible="0"' : ''
      return `<Feature name="${xmlEscape(feature.name)}" type="${xmlEscape(feature.type)}" directionality="${directionality}"${visibleAttr}${cleavageAttr}${translationAttrs}${consecutiveNumberingAttr}>${segments}${exportSnapGeneFeatureQualifiersXml(feature)}${translationQualifiers}</Feature>`
    })
    .join('')}</Features>`

  const primersXml = options.snapGenePacketOrder
    ? exportSnapGenePrimersXmlNative(record, modern, options.primerHybridization)
    : `<Primers>${formatHybridizationParamsXml(
        normalizePrimerHybridizationParams(options.primerHybridization ?? defaultPrimerHybridizationParams),
        modern,
      )}${record.primers
    .map((primer) => {
      const primerAttrs = [
        `name="${xmlEscape(primer.name)}"`,
        `sequence="${xmlEscape(primer.sequence)}"`,
        `color="${xmlEscape(primer.color)}"`,
        primer.description ? `description="${escapeSnapGenePrimerDescription(primer.description)}"` : '',
        primer.visible === false ? 'visible="0"' : '',
      ].filter(Boolean).join(' ')

      const bindingSites = (primer.bindings ?? []).map((binding) => {
        const boundStrand = binding.strand === 'reverse' ? '1' : '0'
        const location = `${binding.templateStart}-${binding.templateEnd - 1}`
        const annealedBases = binding.components
          .filter((component) => component.templateStart !== undefined)
          .map((component) => component.primerBases)
          .join('')

        const componentsXml = binding.components
          .map((component) => {
            const bases = xmlEscape(component.primerBases)
            if (component.templateStart === undefined) {
              return `<Component bases="${bases}"/>`
            }
            const start = component.templateStart
            const end = (component.templateEnd ?? (start + component.primerBases.length)) - 1
            return `<Component hybridizedRange="${start}-${end}" bases="${bases}"/>`
          })
          .join('')

        return `<BindingSite location="${location}" boundStrand="${boundStrand}" annealedBases="${xmlEscape(annealedBases)}">${componentsXml}</BindingSite>`
      }).join('')

      return `<Primer ${primerAttrs}>${bindingSites}</Primer>`
    })
    .join('')}</Primers>`

  const enzymeCachePackets =
    options.enzymeBlocks === false
      ? []
      : snapGeneEnzymeCachePackets(options.enzymeCache ?? 'none', record).map(({ type, payload }) =>
          snapGenePacket(type, payload),
        )
  const enzymeDisplayPackets =
    options.enzymeBlocks === false
      ? []
      : snapGeneEnzymeDisplayPackets(
          encoder,
          {
            ...options,
            block8Xml: options.snapGenePacketOrder ? exportSnapGeneBlock8XmlNative(record) : undefined,
          },
          record,
        ).map(({ type, payload }) => snapGenePacket(type, payload))
  const alignmentPackets =
    options.includeTraces === false ? [] : encodeSnapGeneAlignmentPackets(record.traceFiles ?? [])
  const alignablePacket =
    alignmentPackets.length > 0 && alignmentPackets[0]![0] === 0x11 ? alignmentPackets[0]! : null
  const traceContainerPackets =
    alignmentPackets.length > 0 && alignmentPackets[0]![0] === 0x11 ? alignmentPackets.slice(1) : alignmentPackets
  const emptyAlignablePacket =
    modern && !alignablePacket
      ? snapGenePacket(0x11, encoder.encode(SNAPGENE_ALIGNABLE_SEQUENCES_EMPTY_XML))
      : null
  const preparedHistory = options.includeHistory === false ? undefined : prepareExportHistory(record)
  const exportHistory = preparedHistory ? normalizeSnapGeneHistoryNodeIds(preparedHistory) : undefined
  const currentHistoryFingerprint = exportHistory
    ? snapGeneHistoryTreeFingerprint(record)
    : undefined
  const nativeHistory = options.includeHistory === false
    ? undefined
    : record.snapGeneNativeHistory
  const nativeTreePayload =
    nativeHistory?.treePayload && (
      !exportHistory || nativeHistory.treeFingerprint === currentHistoryFingerprint
    )
      ? nativeHistory.treePayload
      : undefined
  const historyPacket = exportHistory || nativeTreePayload
    ? snapGenePacket(
        0x07,
        nativeTreePayload ?? compressSnapGeneXmlToXz(exportSnapGeneHistoryTreeXml(exportHistory!, record.molecule)),
      )
    : null
  const nativeHistoryNodePayloads = exportHistory || nativeHistory
    ? snapGeneNativeNodePayloadsForExport(nativeHistory, exportHistory, currentHistoryFingerprint)
    : []
  const historyNodePackets = exportHistory || nativeHistory
    ? [
        ...nativeHistoryNodePayloads,
        ...(exportHistory
          ? generatedHistoryNodePayloads(exportHistory, record.molecule, encoder, nativeHistoryNodePayloads)
          : []),
      ].map((payload) => snapGenePacket(0x0b, payload))
    : []
  const strandColorsPacket =
    options.includeStrandColors !== false &&
    record.strandColors &&
    (record.strandColors.topStrand.length > 0 || record.strandColors.bottomStrand.length > 0)
      ? snapGenePacket(0x14, encoder.encode(`<?xml version="1.0"?>${exportSnapGeneStrandColorsXml(record.strandColors)}`))
      : null
  const dnaComparisonAttachmentPackets = encodeDnaComparisonAttachmentPackets(record, options.includeTraces !== false)

  const corePackets = [
    snapGenePacket(0x09, cookie),
    snapGenePacket(0x00, dnaPayload),
    ...enzymeCachePackets,
  ]

  if (options.snapGenePacketOrder) {
    const block8 = enzymeDisplayPackets.find((packet) => packet[0] === 0x08)
    const block13 = enzymeDisplayPackets.find((packet) => packet[0] === 0x0d)
    const block28 = enzymeDisplayPackets.find((packet) => packet[0] === 0x1c)
    const block14 = enzymeDisplayPackets.find((packet) => packet[0] === 0x0e)
    return concatBytes([
      ...corePackets,
      ...(alignablePacket ? [alignablePacket] : emptyAlignablePacket ? [emptyAlignablePacket] : []),
      ...(block8 ? [block8] : []),
      snapGenePacket(0x0a, encoder.encode(featuresXml)),
      snapGenePacket(0x05, encoder.encode(primersXml)),
      snapGenePacket(0x06, encoder.encode(notesXml)),
      ...(block13 ? [block13] : []),
      ...(block28 ? [block28] : []),
      ...(block14 ? [block14] : []),
      ...historyNodePackets,
      ...(historyPacket ? [historyPacket] : []),
      ...(strandColorsPacket ? [strandColorsPacket] : []),
      ...traceContainerPackets,
      ...dnaComparisonAttachmentPackets,
    ])
  }

  return concatBytes([
    ...corePackets,
    snapGenePacket(0x06, encoder.encode(notesXml)),
    snapGenePacket(0x0a, encoder.encode(featuresXml)),
    snapGenePacket(0x05, encoder.encode(primersXml)),
    ...enzymeDisplayPackets,
    ...historyNodePackets,
    ...(historyPacket ? [historyPacket] : []),
    ...(strandColorsPacket ? [strandColorsPacket] : []),
    ...alignmentPackets,
    ...dnaComparisonAttachmentPackets,
  ])
}
