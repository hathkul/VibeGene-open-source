import { reconcileImportedBindingLayout } from './primerSequenceLayout'
import { reconcileSgRnaOligoNamesInRecord } from './sgrnaOligoPrimers'
import { parseHybridizationParamsFromXml, type PrimerHybridizationParams } from './primerHybridization'
import type { ConstructProperties, DnaEnds, HistoryAssemblyPart, HistoryFeature, HistoryNode, HostMethylationStatus, MoleculeType, Primer, PrimerBindingLayout, PrimerLayoutComponent, SequenceFeature, SequenceRecord, Strand, StrandColors, Topology } from './types'
import type { SavedEnzymeSet } from './enzymePreferences'
import {
  defaultConstructProperties,
  organismIdFromLabel,
  strainIdFromSnapGeneName,
} from './constructProperties'
import {
  snapGeneEnzymeCacheForSequence,
  snapGeneEnzymeCacheFromBlocks,
  type SnapGeneEnzymeCache,
} from './snapgeneEnzymeData'
import { parseSnapGeneTracesFromBlocks } from './snapgeneTraces'
import { snapGeneImportedFeatureFields } from './snapgeneFeatureTranslation'
import { parseFeatureQualifiers, serializeFeatureQualifiers } from './featureQualifiers'
import { parseCustomEnzymeSetsXml } from './snapgeneCustomEnzymeSets'
import { snapGeneHistoryTreeFingerprint } from './snapgeneHistoryExport'
import { snapGeneNativeHistoryFromBlocks } from './snapgeneNativeHistory'
import { decompressSnapGeneXz, isSnapGeneXzPayload } from './snapgeneLzma'
import { readSnapGeneHistoryNodePackets } from './snapgeneHistoryPackets'
import { parseSnapGeneHistoryColorsElement, parseSnapGeneStrandColorsXml } from './snapgeneStrandColors'
import { defaultDnaEnds, parseSnapGeneBlock8DnaEnds, snapGeneBlock8HasExplicitDnaEnds } from './dnaEnds'
import { createId, normalizeDna } from './sequence'
import { hydrateSnapGeneProteinRecord } from './snapgeneProtein'
import { SNAPGENE_ATTACHMENT_BLOCK } from './snapgeneAttachments'
import { hydrateSnapGeneDnaComparisonRecord } from './snapgeneDnaComparison'
import { hydrateLibraryTracesFromDocument } from './libraryMemberFeatures'
import { featureColors, makeRecord } from './parserRecord'
import { decodeSnapGeneCompressedDna } from './snapGeneDnaCodec'
import { PRIMER_FALLBACK_COLOR } from './primerLayoutTypes'
export function isSnapGeneBytes(bytes: Uint8Array) {
  if (bytes.length < 19 || bytes[0] !== 0x09) return false
  const length = new DataView(bytes.buffer, bytes.byteOffset + 1, 4).getUint32(0, false)
  if (length !== 14 || bytes.length < 5 + length) return false
  return new TextDecoder('ascii').decode(bytes.slice(5, 13)) === 'SnapGene'
}

function decodeAscii(bytes: Uint8Array) {
  return new TextDecoder('ascii').decode(bytes)
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes)
}

function decodeSnapGeneXmlPayload(bytes: Uint8Array) {
  if (isSnapGeneXzPayload(bytes)) {
    return new TextDecoder().decode(decompressSnapGeneXz(bytes))
  }
  return decodeUtf8(bytes)
}

function xmlDocument(text: string) {
  const parser = new DOMParser()
  const document = parser.parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) return null
  return document
}

function decodeXmlHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&amp;/gi, '&')
}

function cleanXmlText(value: string | null | undefined) {
  return decodeXmlHtmlEntities((value ?? '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip SnapGene HTML / escaped markup while preserving paragraph breaks. */
function snapGeneHtmlToPlain(value: string | null | undefined) {
  const raw = value ?? ''
  if (!raw.trim()) return ''
  return decodeXmlHtmlEntities(
    raw
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*p\s*>/gi, '\n')
      .replace(/<\s*p\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function parseSnapGeneDate(text: string | null | undefined, utcAttr?: string | null): string | undefined {
  const match = (text ?? '').trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  let hours = 0
  let minutes = 0
  let seconds = 0
  const time = (utcAttr ?? '').trim().match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/)
  if (time) {
    hours = Number(time[1])
    minutes = Number(time[2])
    seconds = Number(time[3])
  }
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds))
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function formatSnapGeneReferencesText(document: Document): string {
  return [...document.querySelectorAll('References > Reference')]
    .map((reference) => {
      const authors = (reference.getAttribute('authors') ?? '').trim()
      const title = (reference.getAttribute('title') ?? '').trim()
      const journal = (reference.getAttribute('journal') ?? '').trim()
      const pmid = (reference.getAttribute('pubMedID') ?? '').trim()
      const parts = [
        authors,
        title ? `"${title}"` : '',
        journal,
        pmid ? `PMID: ${pmid}` : '',
      ].filter(Boolean)
      return parts.join(' ')
    })
    .filter(Boolean)
    .join('\n\n')
}

function methylationFromSnapGeneFlags(flags: number): HostMethylationStatus {
  return {
    dam: Boolean(flags & 0x04),
    dcm: Boolean(flags & 0x08),
    ecoKI: Boolean(flags & 0x10),
  }
}

export type ParsedSnapGeneNotes = {
  name?: string
  description?: string
  mapLabel?: string
  documentUuid?: string
  createdAt?: string
  updatedAt?: string
  construct: Partial<ConstructProperties>
}

function parseSnapGeneNotesXml(xml: string): ParsedSnapGeneNotes {
  const document = xmlDocument(xml)
  if (!document) return { construct: {} }

  const typeText = cleanXmlText(document.querySelector('Type')?.textContent).toLowerCase()
  const syntheticDna = typeText !== 'natural'
  const confirmed =
    cleanXmlText(document.querySelector('ConfirmedExperimentally')?.textContent) === '1'
  const descriptionText = snapGeneHtmlToPlain(document.querySelector('Description')?.textContent)
  const commentsText = snapGeneHtmlToPlain(document.querySelector('Comments')?.textContent)
  const label = cleanXmlText(document.querySelector('CustomMapLabel')?.textContent)
  const uuid = cleanXmlText(document.querySelector('UUID')?.textContent)
  const author = cleanXmlText(document.querySelector('CreatedBy')?.textContent)
  const accessionNumber = cleanXmlText(document.querySelector('AccessionNumber')?.textContent)
  const codeNumber = cleanXmlText(document.querySelector('CodeNumber')?.textContent)
  const sequenceClass = cleanXmlText(document.querySelector('SequenceClass')?.textContent).toUpperCase()
  const organismLabel = cleanXmlText(document.querySelector('Organism')?.textContent)
  const organismId = organismIdFromLabel(organismLabel)
  const strainId = strainIdFromSnapGeneName(
    cleanXmlText(document.querySelector('TransformedInto')?.textContent),
  )
  const createdEl = document.querySelector('Created')
  const modifiedEl = document.querySelector('LastModified')
  const createdAt = parseSnapGeneDate(createdEl?.textContent, createdEl?.getAttribute('UTC'))
  const updatedAt = parseSnapGeneDate(modifiedEl?.textContent, modifiedEl?.getAttribute('UTC'))
  const references = formatSnapGeneReferencesText(document)

  const construct: Partial<ConstructProperties> = {
    syntheticDna,
    confirmedExperimentally: confirmed,
    sequenceAuthor: author || undefined,
    accessionNumber: accessionNumber || undefined,
    codeNumber: codeNumber || undefined,
    sequenceClass: sequenceClass || undefined,
    comments: commentsText || undefined,
    references: references || undefined,
    bacterialTransformationStrain: strainId,
  }
  if (syntheticDna) {
    construct.laboratoryHostOrganism = organismId
  } else {
    construct.sourceOrganism = organismId
  }

  return {
    name: label || undefined,
    description: descriptionText || undefined,
    mapLabel: label || undefined,
    documentUuid: uuid || undefined,
    createdAt,
    updatedAt,
    construct,
  }
}

function snapGeneQualifierValues(featureElement: Element, qualifierName: string) {
  return [...featureElement.querySelectorAll(`Q[name="${qualifierName}"] V`)]
    .map((valueElement) => cleanXmlText(valueElement.getAttribute('text') ?? valueElement.getAttribute('predef') ?? valueElement.getAttribute('int')))
    .filter(Boolean)
}

function parseSnapGeneRange(range: string, strand: Strand, sequenceLength: number) {
  const [startText, endText] = range.split('-')
  const start = Number(startText) - 1
  const end = Number(endText)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return []
  if (start >= end) {
    return [
      { start: Math.max(0, Math.min(sequenceLength, start)), end: sequenceLength, strand },
      { start: 0, end: Math.max(0, Math.min(sequenceLength, end)), strand },
    ]
  }
  return [{ start: Math.max(0, Math.min(sequenceLength, start)), end: Math.max(0, Math.min(sequenceLength, end)), strand }]
}

function parseSnapGeneFeatures(xml: string, sequenceLength: number) {
  const document = xmlDocument(xml)
  if (!document) return []
  return [...document.querySelectorAll('Feature')].flatMap((featureElement): SequenceFeature[] => {
    const type = featureElement.getAttribute('type') || 'misc_feature'
    const directionCode = featureElement.getAttribute('directionality')
    const strand: Strand = directionCode === '2' ? 'reverse' : 'forward'
    const directionality = directionCode === '0' ? 'none' : directionCode === '2' ? 'reverse' : directionCode === '3' ? 'both' : directionCode === '1' ? 'forward' : undefined
    const segmentElements = [...featureElement.querySelectorAll('Segment')].filter(
      (segment) => segment.getAttribute('type') !== 'gap',
    )
    const segments = segmentElements.flatMap((segment) =>
      parseSnapGeneRange(segment.getAttribute('range') ?? '', strand, sequenceLength),
    )
    if (!segments.length) return []

    const label = snapGeneQualifierValues(featureElement, 'label')[0]
    const notes = snapGeneQualifierValues(featureElement, 'note')
    const name = cleanXmlText(featureElement.getAttribute('name')) || label || notes[0] || type
    const firstSegment = featureElement.querySelector('Segment')
    const color = firstSegment?.getAttribute('color') || featureColors[type] || featureColors.misc_feature
    const qualifierNotes = [...featureElement.querySelectorAll('Q')].flatMap((qualifier) => {
      const qualifierName = qualifier.getAttribute('name')
      if (!qualifierName || qualifierName === 'label' || qualifierName === 'translation' || qualifierName === 'transl_table' || qualifierName === 'codon_start') return []
      return [...qualifier.querySelectorAll('V')].map((value) => {
        const predef = value.getAttribute('predef')
        const textAttr = value.getAttribute('text')
        const intAttr = value.getAttribute('int')
        let raw: string
        if (qualifierName === 'db_xref' && predef && textAttr != null && textAttr !== '') {
          raw = `${predef}:${textAttr}`
        } else {
          const valueText = textAttr ?? predef ?? intAttr
          raw = valueText && /^\s*<html(?:\s|>)/i.test(valueText)
            ? valueText.trim()
            : cleanXmlText(valueText)
        }
        return raw ? `${qualifierName}: ${raw}` : ''
      }).filter(Boolean)
    })

    const imported = snapGeneImportedFeatureFields(featureElement, segmentElements.length, strand)
    const feature: SequenceFeature = {
      id: createId('feature'),
      name,
      type,
      color,
      ...(directionality ? { directionality } : {}),
      notes: qualifierNotes.join(' '),
      locations: segments,
      ...imported,
    }
    if (!imported.translateInSequenceView) return [feature]

    const peptide = snapGeneQualifierValues(featureElement, 'translation')[0]
    if (!peptide) return [feature]

    const translTable = featureElement.querySelector('Q[name="transl_table"] V')?.getAttribute('int')
    const codonStart = featureElement.querySelector('Q[name="codon_start"] V')?.getAttribute('int')
    const qualifiers = parseFeatureQualifiers(feature.notes)
    qualifiers.translation = peptide
    qualifiers.transl_table = translTable?.trim() || '1'
    qualifiers.codon_start = codonStart?.trim() || '1'
    return [{ ...feature, notes: serializeFeatureQualifiers(qualifiers) }]
  })
}

function parseSnapGenePrimerRange(range: string, sequenceLength: number) {
  const [startText, endText] = range.split('-')
  // SnapGene primer BindingSite/Component coordinates are stored one base
  // before the positions shown in the UI; map them directly to zero-based
  // start and add one to the inclusive end.
  const start = Number(startText)
  const end = Number(endText) + 1
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return {
    start: Math.max(0, Math.min(sequenceLength, start)),
    end: Math.max(0, Math.min(sequenceLength, end)),
  }
}

function parseSnapGeneBindingSite(
  bindingSite: Element,
  template: string,
  sequenceLength: number,
): PrimerBindingLayout | null {
  const strand: Strand = bindingSite.getAttribute('boundStrand') === '1' ? 'reverse' : 'forward'
  const location = bindingSite.getAttribute('location') ?? ''
  const locationRange = parseSnapGenePrimerRange(location, sequenceLength)
  if (!locationRange) return null

  const components: PrimerLayoutComponent[] = []
  for (const componentElement of bindingSite.querySelectorAll('Component')) {
    const primerBases = normalizeDna(componentElement.getAttribute('bases') ?? '')
    const hybridizedRange = componentElement.getAttribute('hybridizedRange')
    if (hybridizedRange) {
      const range = parseSnapGenePrimerRange(hybridizedRange, sequenceLength)
      if (!range || !primerBases) continue
      components.push({ primerBases, templateStart: range.start, templateEnd: range.end })
      continue
    }
    if (primerBases) components.push({ primerBases })
  }

  if (!components.length) {
    const annealedBases = normalizeDna(bindingSite.getAttribute('annealedBases') ?? '')
    if (annealedBases) {
      components.push({
        primerBases: annealedBases,
        templateStart: locationRange.start,
        templateEnd: locationRange.end,
      })
    }
  }

  return reconcileImportedBindingLayout(template, {
    strand,
    templateStart: locationRange.start,
    templateEnd: locationRange.end,
    components,
  })
}

function parseSnapGenePrimers(xml: string, template: string): {
  primers: Primer[]
  hybridization?: PrimerHybridizationParams
} {
  const sequenceLength = template.length || Number.MAX_SAFE_INTEGER
  const document = xmlDocument(xml)
  if (!document) return { primers: [] }
  const hybridization = parseHybridizationParamsFromXml(xml) ?? undefined
  const primers = [...document.querySelectorAll('Primer')].flatMap((primerElement) => {
    const name = cleanXmlText(primerElement.getAttribute('name')) || 'SnapGene primer'
    // DOMParser has already decoded the XML attribute. Treat it as plain text:
    // collapsing whitespace or decoding it again corrupts user descriptions.
    const description = primerElement.getAttribute('description') ?? ''
    const sequence =
      normalizeDna(primerElement.getAttribute('sequence') ?? primerElement.getAttribute('bases') ?? primerElement.querySelector('BindingSite')?.getAttribute('annealedBases') ?? '')
    if (!sequence) return []
    const bindings = [...primerElement.querySelectorAll('BindingSite')]
      .filter((siteElement) => siteElement.getAttribute('simplified') !== '1')
      .map((siteElement) => parseSnapGeneBindingSite(siteElement, template, sequenceLength))
      .filter((layout): layout is PrimerBindingLayout => Boolean(layout))
    return [{
      id: createId('primer'),
      name,
      sequence,
      color: primerElement.getAttribute('color') || PRIMER_FALLBACK_COLOR,
      description,
      bindings,
      ...(primerElement.getAttribute('visible') === '0' ? { visible: false as const } : {}),
    }]
  })
  return { primers, ...(hybridization ? { hybridization } : {}) }
}

function directChildElements(element: Element, tagName: string) {
  return [...element.children].filter((child) => child.tagName === tagName)
}

function parseHistoryFeatures(nodeElement: Element): HistoryFeature[] {
  const featuresElement = directChildElements(nodeElement, 'Features')[0]
  if (!featuresElement) return []
  return directChildElements(featuresElement, 'Feature').flatMap((featureElement): HistoryFeature[] => {
    const type = featureElement.getAttribute('type') || 'misc_feature'
    const strand: Strand = featureElement.getAttribute('directionality') === '2' ? 'reverse' : 'forward'
    const segments = directChildElements(featureElement, 'Segment')
      .filter((segment) => segment.getAttribute('type') !== 'gap')
      .flatMap((segment) => {
        const range = segment.getAttribute('range') ?? ''
        const [startText, endText] = range.split('-')
        // SnapGene Segment ranges are 1-based inclusive; convert to 0-based half-open.
        const start = Number(startText) - 1
        const end = Number(endText)
        if (!Number.isFinite(start) || !Number.isFinite(end)) return []
        return [{ start: Math.max(0, start), end }]
      })
    if (!segments.length) return []
    const firstSegment = directChildElements(featureElement, 'Segment')[0]
    const color = firstSegment?.getAttribute('color') || featureColors[type] || featureColors.misc_feature
    const label = snapGeneQualifierValues(featureElement, 'label')[0]
    const name = cleanXmlText(featureElement.getAttribute('name')) || label || type
    return [{ name, type, color, strand, segments }]
  })
}

function parseHistoryAssemblyPart(value: unknown): HistoryAssemblyPart | undefined {
  if (!value || typeof value !== 'object') return undefined
  const part = value as Record<string, unknown>
  if ((part.role !== 'vector' && part.role !== 'fragment')
    || (part.orientation !== 'forward' && part.orientation !== 'reverse')
    || typeof part.length !== 'number' || !Number.isFinite(part.length) || part.length < 0
    || !part.linearization || typeof part.linearization !== 'object') return undefined
  const linearization = part.linearization as Record<string, unknown>
  if (linearization.method === 'pcr') {
    const primerValid = (primer: unknown) => Boolean(primer && typeof primer === 'object'
      && typeof (primer as Record<string, unknown>).name === 'string'
      && typeof (primer as Record<string, unknown>).sequence === 'string')
    if (!primerValid(linearization.forwardPrimer) || !primerValid(linearization.reversePrimer)
      || typeof linearization.polymerase !== 'string') return undefined
  } else if (linearization.method === 'restriction') {
    if (typeof linearization.leftEnzyme !== 'string' || typeof linearization.rightEnzyme !== 'string') return undefined
  } else if (linearization.method !== 'direct') return undefined
  return part as HistoryAssemblyPart
}

function parseHistoryNode(element: Element): HistoryNode {
  const oligos = directChildElements(element, 'Oligo').map((oligo) => ({
    name: cleanXmlText(oligo.getAttribute('name')) || 'oligo',
    sequence: (oligo.getAttribute('sequence') ?? '').trim(),
    description: cleanXmlText(oligo.getAttribute('description')) || undefined,
  }))

  const polymerase = directChildElements(element, 'Parameter')
    .find((parameter) => parameter.getAttribute('name') === 'polymerase')
    ?.getAttribute('val') ?? undefined

  const sgRnaCloning = (() => {
    const raw = directChildElements(element, 'Parameter')
      .find((parameter) => parameter.getAttribute('name') === 'vibegeneSgRnaCloning')
      ?.getAttribute('val')
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw)
      return parsed?.version === 1 && Array.isArray(parsed.guides) && Array.isArray(parsed.oligos)
        ? parsed as HistoryNode['sgRnaCloning'] : undefined
    } catch { return undefined }
  })()

  const regeneratedSites = directChildElements(element, 'RegeneratedSite').map((site) => ({
    name: cleanXmlText(site.getAttribute('name')) || 'site',
    pos: Number(site.getAttribute('pos') ?? 0),
    siteCount: Number(site.getAttribute('siteCount') ?? 0),
    blunt: site.getAttribute('blunt') === '1',
  }))

  const assemblyParts = (() => {
    const raw = directChildElements(element, 'Parameter')
      .find((parameter) => parameter.getAttribute('name') === 'vibegeneAssemblyParts')
      ?.getAttribute('val')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return parsed?.version === 1 && Array.isArray(parsed.parts) ? parsed.parts.map(parseHistoryAssemblyPart) : []
    } catch { return [] }
  })()
  const inputSummaries = directChildElements(element, 'InputSummary').map((summary, index) => ({
    manipulation: summary.getAttribute('manipulation') ?? '',
    name1: summary.getAttribute('name1') ?? undefined,
    name2: summary.getAttribute('name2') ?? undefined,
    val1: summary.getAttribute('val1') ?? undefined,
    val2: summary.getAttribute('val2') ?? undefined,
    siteCount1: summary.getAttribute('siteCount1') ?? undefined,
    siteCount2: summary.getAttribute('siteCount2') ?? undefined,
    ...(assemblyParts[index] ? { assemblyPart: assemblyParts[index] } : {}),
  }))

  const seqLen = Number(element.getAttribute('seqLen') ?? 0)
  const historyColors = parseSnapGeneHistoryColorsElement(
    directChildElements(element, 'HistoryColors')[0] ?? null,
    seqLen || Number.MAX_SAFE_INTEGER,
  )

  return {
    id: element.getAttribute('ID') ?? createId('history'),
    name: cleanXmlText(element.getAttribute('name')) || 'Construct',
    seqLen,
    circular: element.getAttribute('circular') === '1',
    operation: element.getAttribute('operation') ?? 'invalid',
    resurrectable: element.getAttribute('resurrectable') === '1',
    hideHistory: element.getAttribute('hideHistory') === '1',
    upstreamModification: element.getAttribute('upstreamModification') ?? undefined,
    downstreamModification: element.getAttribute('downstreamModification') ?? undefined,
    upstreamStickiness: element.hasAttribute('upstreamStickiness')
      ? Number(element.getAttribute('upstreamStickiness'))
      : undefined,
    downstreamStickiness: element.hasAttribute('downstreamStickiness')
      ? Number(element.getAttribute('downstreamStickiness'))
      : undefined,
    oligos,
    sgRnaCloning,
    polymerase,
    regeneratedSites,
    inputSummaries,
    features: parseHistoryFeatures(element),
    historyColors,
    children: directChildElements(element, 'Node').map(parseHistoryNode),
  }
}

function parseSnapGeneHistory(xml: string): HistoryNode | undefined {
  const document = xmlDocument(xml)
  const root = document?.querySelector('HistoryTree > Node')
  if (!root) return undefined
  return parseHistoryNode(root)
}

/**
 * Decode an ancestor snapshot from a SnapGene history-node block (0x0b).
 *
 * Layout: [uint32 node ID][ nested SnapGene packets ]. Sequence is in 0x00/0x01;
 * primers are in nested 0x05 (same Primers XML as the top-level block).
 */
function decodeHistoryNodeBlock(block: Uint8Array): {
  id: number
  sequence?: string
  primers?: Primer[]
} | null {
  if (block.length < 9) return null
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const id = view.getUint32(0, false)
  let sequence: string | undefined
  let primersXml: string | undefined
  let cursor = 4
  while (cursor + 5 <= block.length) {
    const type = block[cursor]!
    const packetLength = view.getUint32(cursor + 1, false)
    const payloadStart = cursor + 5
    const payloadEnd = payloadStart + packetLength
    if (payloadEnd > block.length) break
    if (type === 0x00 && packetLength > 1) {
      sequence = decodeAscii(block.slice(payloadStart + 1, payloadEnd))
    } else if (type === 0x01) {
      sequence = decodeSnapGeneCompressedDna(block.subarray(payloadStart, payloadEnd)) ?? sequence
    } else if (type === 0x05) {
      primersXml = decodeUtf8(block.subarray(payloadStart, payloadEnd))
    }
    cursor = payloadEnd
  }
  if (!sequence && !primersXml) return null
  const parsedPrimers = primersXml ? parseSnapGenePrimers(primersXml, sequence ?? '') : undefined
  return {
    id,
    sequence,
    primers: parsedPrimers?.primers.length ? parsedPrimers.primers : undefined,
  }
}

export type SnapGeneHistoryNodeDocumentData = {
  id: string
  molecule?: MoleculeType
  topology?: Topology
  sequence?: string
  features?: SequenceFeature[]
  primers?: Primer[]
  notes?: ParsedSnapGeneNotes
  dnaEnds?: DnaEnds
  dnaEndsProvenance?: SequenceRecord['dnaEndsProvenance']
  strandColors?: StrandColors
  snapGeneEnzymes?: SnapGeneEnzymeCache
  fileEnzymeSets?: SavedEnzymeSet[]
}

/** Decode every ancestor-document packet that Vibegene currently understands. */
export function parseSnapGeneHistoryNodeDocumentData(
  block: Uint8Array | undefined,
): SnapGeneHistoryNodeDocumentData | undefined {
  if (!block || block.byteLength < 4) return undefined
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const id = String(view.getUint32(0, false))
  const packets = readSnapGeneHistoryNodePackets(block)

  let molecule: MoleculeType | undefined
  let topology: Topology | undefined
  let sequence: string | undefined
  let hostMethylation: HostMethylationStatus | undefined
  const plainDna = packets.get(0x00)?.[0]
  const compressedDna = packets.get(0x01)?.[0]
  const rna = packets.get(0x20)?.[0]
  const protein = packets.get(0x15)?.[0]
  if (plainDna?.byteLength) {
    const flags = plainDna[0]!
    molecule = 'dna'
    topology = flags & 0x01 ? 'circular' : 'linear'
    hostMethylation = methylationFromSnapGeneFlags(flags)
    sequence = decodeAscii(plainDna.subarray(1))
  } else if (compressedDna) {
    const decoded = decodeCompressedSnapGeneDna(compressedDna)
    if (decoded) {
      molecule = 'dna'
      topology = decoded.topology
      sequence = decoded.sequence
    }
  } else if (rna) {
    molecule = 'rna'
    topology = 'linear'
    sequence = decodeUtf8(rna).replace(/U/g, 'T')
  } else if (protein) {
    molecule = 'protein'
    topology = 'linear'
    sequence = decodeUtf8(protein)
  }

  const notesPayload = packets.get(0x06)?.[0]
  const notes = notesPayload ? parseSnapGeneNotesXml(decodeUtf8(notesPayload)) : undefined
  if (notes && hostMethylation) {
    notes.construct = { ...notes.construct, hostMethylation }
  }
  const sequenceLength = sequence?.length ?? Number.MAX_SAFE_INTEGER
  const featurePayload = packets.get(0x0a)?.[0]
  const primerPayload = packets.get(0x05)?.[0]
  const dnaEndsPayload = packets.get(0x08)?.[0]
  const strandColorsPayload = packets.get(0x14)?.[0]
  const customSetsPayload = packets.get(0x0e)?.[0]
  const cache = snapGeneEnzymeCacheForSequence(
    snapGeneEnzymeCacheFromBlocks(
      packets.get(0x03)?.[0],
      packets.get(0x0d)?.[0],
      packets.get(0x02)?.[0],
      notes?.documentUuid,
      packets.get(0x1c)?.[0],
    ),
    sequence?.length ?? 0,
  )

  return {
    id,
    ...(molecule ? { molecule } : {}),
    ...(topology ? { topology } : {}),
    ...(sequence !== undefined ? { sequence } : {}),
    ...(featurePayload
      ? { features: parseSnapGeneFeatures(decodeUtf8(featurePayload), sequenceLength) }
      : {}),
    ...(primerPayload
      ? { primers: parseSnapGenePrimers(decodeUtf8(primerPayload), sequence ?? '').primers }
      : {}),
    ...(notes ? { notes } : {}),
    ...(dnaEndsPayload
      ? {
          dnaEnds: parseSnapGeneBlock8DnaEnds(decodeUtf8(dnaEndsPayload)),
          ...(snapGeneBlock8HasExplicitDnaEnds(decodeUtf8(dnaEndsPayload))
            ? { dnaEndsProvenance: 'snapgene-block8' as const }
            : {}),
        }
      : {}),
    ...(strandColorsPayload
      ? { strandColors: parseSnapGeneStrandColorsXml(decodeUtf8(strandColorsPayload), sequenceLength) }
      : {}),
    ...(cache ? { snapGeneEnzymes: cache } : {}),
    ...(customSetsPayload
      ? { fileEnzymeSets: parseCustomEnzymeSetsXml(decodeSnapGeneXmlPayload(customSetsPayload)) }
      : {}),
  }
}

function attachHistorySnapshots(
  node: HistoryNode,
  snapshots: Map<number, { sequence?: string; primers?: Primer[] }>,
) {
  const snapshot = snapshots.get(Number(node.id))
  if (snapshot) {
    if (snapshot.sequence) node.sequence = snapshot.sequence
    if (snapshot.primers?.length) node.primers = snapshot.primers
  }
  for (const child of node.children) attachHistorySnapshots(child, snapshots)
}

function decodeCompressedSnapGeneDna(data: Uint8Array) {
  const sequence = decodeSnapGeneCompressedDna(data)
  if (!sequence) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const totalLen = view.getUint32(0, false)
  let topology: Topology = 'linear'
  if (data.length >= 22 && view.getUint32(4, false) === totalLen) {
    topology = data[8]! & 0x01 ? 'circular' : 'linear'
  } else if (data.length >= 5) {
    topology = data[4]! & 0x01 ? 'circular' : 'linear'
  } else if (data.length > 0) {
    topology = data[0]! & 0x01 ? 'circular' : 'linear'
  }
  return { sequence, topology }
}

export function snapGeneHasReadableSequencePayload(bytes: Uint8Array): boolean {
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const blockType = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    const data = bytes.subarray(start, end)
    if (blockType === 0x00 && length > 1) return true
    if (blockType === 0x01 && decodeCompressedSnapGeneDna(data)) return true
    if ((blockType === 0x20 || blockType === 0x15) && length > 0) return true
    offset = end
  }
  return false
}

export function parseSnapGene(
  bytes: Uint8Array,
  fileName = 'SnapGene import',
  options?: { skipTraces?: boolean },
): SequenceRecord {
  if (!isSnapGeneBytes(bytes)) throw new Error('The file is not a valid SnapGene .dna file.')
  let offset = 0
  let sequence = ''
  let topology: Topology = 'linear'
  let molecule: SequenceRecord['molecule'] = 'dna'
  let name = fileName.replace(/\.[^.]+$/, '')
  let description = ''
  let mapLabel: string | undefined
  let documentUuid: string | undefined
  let createdAt: string | undefined
  let updatedAt: string | undefined
  let notesConstruct: Partial<ConstructProperties> = {}
  let hostMethylationFromFlags: HostMethylationStatus | undefined
  let features: SequenceFeature[] = []
  let primers: SequenceRecord['primers'] = []
  let history: HistoryNode | undefined
  let strandColors: StrandColors | undefined
  let dnaEnds = defaultDnaEnds()
  let dnaEndsProvenance: SequenceRecord['dnaEndsProvenance']
  const rawBlocks = new Map<number, Uint8Array[]>()

  while (offset + 5 <= bytes.length) {
    const blockType = bytes[offset]
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    // Keep packet payloads as views over the source file. In particular, copying
    // large optional attachments here can double memory use before they are read.
    const data = bytes.subarray(start, end)
    const existingBlocks = rawBlocks.get(blockType) ?? []
    existingBlocks.push(data)
    rawBlocks.set(blockType, existingBlocks)

    if (blockType === 0x00 && data.length) {
      const flags = data[0]!
      topology = flags & 0x01 ? 'circular' : 'linear'
      hostMethylationFromFlags = methylationFromSnapGeneFlags(flags)
      sequence = decodeAscii(data.slice(1))
      molecule = 'dna'
    } else if (blockType === 0x01 && !sequence) {
      const compressed = decodeCompressedSnapGeneDna(data)
      if (compressed) {
        sequence = compressed.sequence
        topology = compressed.topology
        molecule = 'dna'
      }
    } else if (blockType === 0x20 && !sequence) {
      sequence = decodeUtf8(data).replace(/U/g, 'T')
      molecule = 'rna'
    } else if (blockType === 0x15 && !sequence) {
      sequence = decodeUtf8(data)
      molecule = 'protein'
    } else if (blockType === 0x06) {
      const notes = parseSnapGeneNotesXml(decodeUtf8(data))
      if (notes.documentUuid) documentUuid = notes.documentUuid
      if (notes.description) description = notes.description
      if (notes.mapLabel) {
        mapLabel = notes.mapLabel
        name = notes.mapLabel
      } else if (notes.name) {
        name = notes.name
      }
      if (notes.createdAt) createdAt = notes.createdAt
      if (notes.updatedAt) updatedAt = notes.updatedAt
      notesConstruct = notes.construct
    } else if (blockType === 0x08) {
      const xml = decodeUtf8(data)
      dnaEnds = parseSnapGeneBlock8DnaEnds(xml)
      if (snapGeneBlock8HasExplicitDnaEnds(xml)) dnaEndsProvenance = 'snapgene-block8'
    } else if (blockType === 0x0a) {
      features = parseSnapGeneFeatures(decodeUtf8(data), sequence.length || Number.MAX_SAFE_INTEGER)
    } else if (blockType === 0x05) {
      const parsed = parseSnapGenePrimers(decodeUtf8(data), sequence)
      primers = parsed.primers
    } else if (blockType === 0x07) {
      history = parseSnapGeneHistory(decodeSnapGeneXmlPayload(data))
    } else if (blockType === 0x14) {
      strandColors = parseSnapGeneStrandColorsXml(decodeUtf8(data), sequence.length || Number.MAX_SAFE_INTEGER)
    }

    offset = end
  }

  if (!sequence) throw new Error('Unsupported SnapGene file: no readable sequence block was found.')

  if (history) {
    // The root node is the current document; ancestors carry their own 0x0b block.
    history.sequence = sequence
    history.primers = primers.length ? primers : history.primers
    const nodeSnapshots = new Map<number, { sequence?: string; primers?: Primer[] }>()
    for (const block of rawBlocks.get(0x0b) ?? []) {
      const decoded = decodeHistoryNodeBlock(block)
      if (decoded) nodeSnapshots.set(decoded.id, { sequence: decoded.sequence, primers: decoded.primers })
    }
    for (const child of history.children) attachHistorySnapshots(child, nodeSnapshots)
  }

  const traceFiles = options?.skipTraces ? undefined : parseSnapGeneTracesFromBlocks(rawBlocks, sequence, topology)
  const block2 = rawBlocks.get(0x02)?.[0]
  const block3 = rawBlocks.get(0x03)?.[0]
  const block13 = rawBlocks.get(0x0d)?.[0]
  const snapGeneEnzymes = snapGeneEnzymeCacheForSequence(
    snapGeneEnzymeCacheFromBlocks(block3, block13, block2, documentUuid, rawBlocks.get(0x1c)?.[0]),
    sequence.length,
  )
  const block14Xml = rawBlocks.get(0x0e)?.[0]
  const fileEnzymeSets = block14Xml
    ? parseCustomEnzymeSetsXml(decodeSnapGeneXmlPayload(block14Xml))
    : undefined
  const construct: ConstructProperties = {
    ...defaultConstructProperties,
    ...notesConstruct,
    ...(hostMethylationFromFlags ? { hostMethylation: hostMethylationFromFlags } : {}),
    // Imported files should not inherit the VibeGene placeholder comment/author.
    comments: notesConstruct.comments ?? '',
    sequenceAuthor: notesConstruct.sequenceAuthor ?? '',
  }

  let record = makeRecord({
    name,
    mapLabel,
    description,
    molecule,
    topology,
    sequence,
    features,
    primers,
    history,
    strandColors: strandColors ?? history?.historyColors,
    dnaEnds,
    dnaEndsProvenance,
    traceFiles: traceFiles?.length ? traceFiles : undefined,
    snapGeneEnzymes,
    fileEnzymeSets: fileEnzymeSets?.length ? fileEnzymeSets : undefined,
    construct,
    createdAt,
    updatedAt,
  })
  const snapGeneNativeHistory = snapGeneNativeHistoryFromBlocks(
    rawBlocks.get(0x07)?.[0],
    rawBlocks.get(0x0b) ?? [],
    history ? snapGeneHistoryTreeFingerprint(record) : undefined,
  )
  if (snapGeneNativeHistory) {
    record = {
      ...record,
      snapGeneNativeHistory,
    }
  }
  if (molecule === 'dna') {
    const hydrated = hydrateSnapGeneDnaComparisonRecord(
      record,
      rawBlocks.get(SNAPGENE_ATTACHMENT_BLOCK) ?? [],
    )
    if (!hydrated.traceFiles?.length) return reconcileSgRnaOligoNamesInRecord(hydrated)
    if (
      !hydrated.dna?.libraryMemberFeatures?.length
      && !hydrated.dna?.libraryMemberPrimers?.length
      && !hydrated.dna?.libraryMemberHistory?.length
      && !hydrated.dna?.libraryMemberReads?.length
    ) {
      return reconcileSgRnaOligoNamesInRecord(hydrated)
    }
    return reconcileSgRnaOligoNamesInRecord({
      ...hydrated,
      traceFiles: hydrateLibraryTracesFromDocument(hydrated, hydrated.traceFiles),
    })
  }
  if (molecule !== 'protein') return record
  return hydrateSnapGeneProteinRecord(
    record,
    rawBlocks.get(SNAPGENE_ATTACHMENT_BLOCK) ?? [],
  )
}
