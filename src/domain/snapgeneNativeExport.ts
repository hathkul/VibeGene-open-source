import { exportSnapGeneBlock8Xml, resolveDnaEnds } from './dnaEnds'
import { featureQualifierValues, parseFeatureQualifiers } from './featureQualifiers'
import { featureDirectionality } from './featureDirectionality'
import { findPrimerBindings, normalizeDna } from './sequence'
import {
  defaultPrimerHybridizationParams,
  formatHybridizationParamsXml,
  normalizePrimerHybridizationParams,
} from './primerHybridization'
import {
  exportSnapGeneTranslationQualifiers,
  formatSnapGeneCleavageArrows,
  snapGeneFeatureTranslationAttrs,
  snapGeneSegmentTranslatedAttr,
} from './snapgeneFeatureTranslation'
import { organismLabelFromId, strainSnapGeneNameFromId } from './constructProperties'
import type { Primer, PrimerBindingLayout, SequenceFeature, SequenceRecord, Strand } from './types'
import { escapeSnapGenePrimerDescription } from './snapgenePrimerDescription'
import type { PrimerHybridizationParams } from './primerHybridization'

const SNAPGENE_TRANSLATION_QUALIFIER_KEYS = new Set(['translation', 'transl_table', 'codon_start', 'label'])

/** Preferred Q order for Gateway attL/attR (matches Addgene / SnapGene-native entry clones). */
const GATEWAY_LR_QUALIFIER_ORDER = ['bound_moiety', 'gene', 'note'] as const

/** True for Gateway attL/attR features SnapGene uses to offer LR cloning. */
export function isSnapGeneGatewayLrAttFeature(feature: Pick<SequenceFeature, 'name' | 'type'>): boolean {
  return feature.type === 'protein_bind' && /^att[LR]/i.test(feature.name)
}

/** Strip SnapGene `<html><body>…</body></html>` wrappers and `<i>` tags from qualifier text. */
export function unwrapSnapGeneHtmlQualifier(value: string): string {
  return value
    .replace(/<\/?html>/gi, '')
    .replace(/<\/?body>/gi, '')
    .replace(/<\/?i>/gi, '')
    .trim()
}

/**
 * SnapGene/Addgene store Gateway LR qualifiers as HTML. Match that exact wrapping so
 * SnapGene Gateway Cloning recognizes attL/attR sites.
 */
export function wrapSnapGeneGatewayLrQualifier(name: string, value: string): string {
  const plain = unwrapSnapGeneHtmlQualifier(value)
  if (name === 'gene') {
    const match = /^mutant version of att([LR])$/i.exec(plain)
    if (match) {
      return `<html><body>mutant version of <i>att</i>${match[1]!.toUpperCase()}</body></html>`
    }
  }
  return `<html><body>${plain}</body></html>`
}

/**
 * Emit SnapGene Feature `<Q>` elements from parsed notes (gene / note / bound_moiety, etc.).
 * Plain unstructured notes fall back to a single `note` qualifier.
 * Gateway attL/attR omit `label` and use HTML-wrapped LR Clonase qualifiers (Addgene-compatible).
 */
export function exportSnapGeneFeatureQualifiersXml(feature: SequenceFeature): string {
  const gatewayAtt = isSnapGeneGatewayLrAttFeature(feature)
  const parts: string[] = []
  if (!gatewayAtt) {
    parts.push(`<Q name="label"><V text="${xmlEscape(feature.name)}"/></Q>`)
  }
  const qualifiers = parseFeatureQualifiers(feature.notes)
  const entries = Object.entries(qualifiers).filter(
    ([key, value]) => value.trim() && !SNAPGENE_TRANSLATION_QUALIFIER_KEYS.has(key),
  )
  if (entries.length === 0) {
    if (feature.notes?.trim() && feature.notes !== SNAPGENE_IMPORTED_PRIMER_BIND_NOTE) {
      parts.push(`<Q name="note"><V text="${xmlEscape(feature.notes)}"/></Q>`)
    }
    return parts.join('')
  }

  const orderedKeys = gatewayAtt
    ? [
        ...GATEWAY_LR_QUALIFIER_ORDER.filter((key) => entries.some(([entryKey]) => entryKey === key)),
        ...entries.map(([key]) => key).filter((key) => !(GATEWAY_LR_QUALIFIER_ORDER as readonly string[]).includes(key)),
      ]
    : entries.map(([key]) => key)

  const byKey = new Map(entries)
  for (const key of orderedKeys) {
    const value = byKey.get(key)
    if (!value) continue
    const values = featureQualifierValues(value)
    if (key === 'db_xref') {
      const valueNodes = values.map((part) => {
        const match = /^([A-Za-z][A-Za-z0-9_.-]*):([\s\S]*)$/.exec(part.trim())
        if (!match) return `<V text="${xmlEscape(part)}"/>`
        return `<V text="${xmlEscape(match[2]!)}" predef="${xmlEscape(match[1]!)}"/>`
      }).join('')
      parts.push(`<Q name="${xmlEscape(key)}">${valueNodes}</Q>`)
      continue
    }
    const valueNodes = values.map((part) => {
      const text = gatewayAtt ? wrapSnapGeneGatewayLrQualifier(key, part) : part
      return `<V text="${xmlEscape(text)}"/>`
    }).join('')
    parts.push(`<Q name="${xmlEscape(key)}">${valueNodes}</Q>`)
  }
  return parts.join('')
}

/** Marker on synthetic primer_bind features created during SnapGene import — not real Features block data. */
export const SNAPGENE_IMPORTED_PRIMER_BIND_NOTE = 'Imported from SnapGene primer binding site'

export function isDerivedSnapGenePrimerBindFeature(feature: SequenceFeature): boolean {
  return feature.type === 'primer_bind' && feature.notes === SNAPGENE_IMPORTED_PRIMER_BIND_NOTE
}

export function snapGeneExportFeatures(record: SequenceRecord): SequenceFeature[] {
  return record.features.filter((feature) => !isDerivedSnapGenePrimerBindFeature(feature))
}

/** SnapGene 8.x cookie versions written after a native save (export, import). */
export const SNAPGENE_COOKIE_EXPORT_VERSION = 15
export const SNAPGENE_COOKIE_IMPORT_VERSION = 19

/** Legacy SnapGene cookie versions still accepted without upgrade on older builds. */
export const SNAPGENE_COOKIE_LEGACY_EXPORT_VERSION = 11
export const SNAPGENE_COOKIE_LEGACY_IMPORT_VERSION = 10

export const SNAPGENE_ALIGNABLE_SEQUENCES_EMPTY_XML = '<AlignableSequences trimStringency="Medium"/>'

function hybridizationParamsXml(params: PrimerHybridizationParams | undefined, modern: boolean) {
  return formatHybridizationParamsXml(
    normalizePrimerHybridizationParams(params ?? defaultPrimerHybridizationParams),
    modern,
  )
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function snapGeneFileDateParts(isoTimestamp?: string) {
  const date = isoTimestamp ? new Date(isoTimestamp) : new Date()
  if (Number.isNaN(date.getTime())) return snapGeneFileDateParts()
  return {
    snapDate: `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`,
    utcAttr: `${date.getUTCHours()}:${date.getUTCMinutes()}:${date.getUTCSeconds()}`,
  }
}

function snapGeneDocumentUuid(record: SequenceRecord): string {
  const cached = record.snapGeneEnzymes?.documentUuid
  if (cached && /^[0-9a-f-]{36}$/i.test(cached)) return cached
  const seed = record.id || record.name || 'vibegene'
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  const hex = hash.toString(16).padStart(8, '0')
  return `${hex.slice(0, 8)}-0000-4000-8000-${hex.padStart(8, '0').slice(0, 8)}0000`.slice(0, 36)
}

function estimateMeltingTemperatureCelsius(bases: string): number {
  const normalized = bases.toLowerCase()
  let at = 0
  let gc = 0
  for (const base of normalized) {
    if (base === 'a' || base === 't') at += 1
    else if (base === 'g' || base === 'c') gc += 1
  }
  return Math.round(2 * at + 4 * gc)
}

function bindingLayoutFromExactMatch(
  primer: Primer,
  start: number,
  end: number,
  strand: Strand,
): PrimerBindingLayout {
  const primerBases = primer.sequence.toLowerCase()
  return {
    strand,
    templateStart: start,
    templateEnd: end,
    components: [{ primerBases, templateStart: start, templateEnd: end }],
  }
}

function resolvePrimerBindingsForExport(record: SequenceRecord): Array<{ primer: Primer; bindings: PrimerBindingLayout[] }> {
  const sequence = normalizeDna(record.sequence)
  const resolved: Array<{ primer: Primer; bindings: PrimerBindingLayout[] }> = []

  for (const primer of record.primers) {
    if (primer.bindings?.length) {
      resolved.push({ primer, bindings: primer.bindings })
      continue
    }
    const exactMatches = findPrimerBindings(sequence, [primer])
    if (!exactMatches.length) {
      resolved.push({ primer, bindings: [] })
      continue
    }
    const match = exactMatches[0]!
    resolved.push({
      primer,
      bindings: [bindingLayoutFromExactMatch(primer, match.start, match.end, match.strand)],
    })
  }

  return resolved
}

function exportBindingSiteXml(binding: PrimerBindingLayout, simplified = false): string {
  const boundStrand = binding.strand === 'reverse' ? '1' : '0'
  const location = `${binding.templateStart}-${binding.templateEnd - 1}`
  const annealedBases = binding.components
    .filter((component) => component.templateStart !== undefined)
    .map((component) => component.primerBases.toLowerCase())
    .join('')
  const meltingTemperature = estimateMeltingTemperatureCelsius(annealedBases)
  const simplifiedAttr = simplified ? ' simplified="1"' : ''
  const componentsXml = binding.components
    .map((component) => {
      const bases = xmlEscape(component.primerBases.toLowerCase())
      if (component.templateStart === undefined) {
        return `<Component bases="${bases}"/>`
      }
      const start = component.templateStart
      const end = (component.templateEnd ?? start + component.primerBases.length) - 1
      return `<Component hybridizedRange="${start}-${end}" bases="${bases}"/>`
    })
    .join('')
  return `<BindingSite location="${location}" boundStrand="${boundStrand}" annealedBases="${xmlEscape(annealedBases)}" meltingTemperature="${meltingTemperature}"${simplifiedAttr}>${componentsXml}</BindingSite>`
}

export function exportSnapGeneNotesXmlNative(record: SequenceRecord, modern = true) {
  const construct = record.construct
  const description = xmlEscape(record.description || record.name)
  const type = construct.syntheticDna ? 'Synthetic' : 'Natural'
  const confirmed = construct.confirmedExperimentally ? '1' : '0'
  const created = snapGeneFileDateParts(record.createdAt)
  const modified = snapGeneFileDateParts(record.updatedAt)
  const transformedInto = xmlEscape(strainSnapGeneNameFromId(construct.bacterialTransformationStrain))
  const sequenceClass = xmlEscape(construct.sequenceClass || 'UNA')
  const organismId = construct.syntheticDna ? construct.laboratoryHostOrganism : construct.sourceOrganism
  const organism = organismLabelFromId(organismId)
  const organismXml =
    organism && organism !== 'unspecified' ? `\n<Organism>${xmlEscape(organism)}</Organism>` : ''
  const accessionXml = construct.accessionNumber.trim()
    ? `\n<AccessionNumber>${xmlEscape(construct.accessionNumber.trim())}</AccessionNumber>`
    : ''
  const codeXml = construct.codeNumber.trim()
    ? `\n<CodeNumber>${xmlEscape(construct.codeNumber.trim())}</CodeNumber>`
    : ''
  const authorXml = construct.sequenceAuthor.trim()
    ? `\n<CreatedBy>${xmlEscape(construct.sequenceAuthor.trim())}</CreatedBy>`
    : ''
  const commentsXml = construct.comments.trim()
    ? `\n<Comments>${xmlEscape(construct.comments.trim())}</Comments>`
    : ''
  const mapLabel = record.mapLabel?.trim()
  const mapLabelXml = mapLabel ? `\n<CustomMapLabel>${xmlEscape(mapLabel)}</CustomMapLabel>` : ''
  const referencesXml = formatSnapGeneReferencesXml(construct.references)

  if (!modern) {
    return `<Notes>\n<Type>${type}</Type>\n<ConfirmedExperimentally>${confirmed}</ConfirmedExperimentally>\n<Description>${description}</Description>\n<Created>${created.snapDate}</Created>\n<LastModified>${modified.snapDate}</LastModified>\n<TransformedInto>${transformedInto}</TransformedInto>${organismXml}${accessionXml}${codeXml}${authorXml}${commentsXml}${mapLabelXml}${referencesXml}\n</Notes>`
  }
  return `<Notes>\n<UUID>${snapGeneDocumentUuid(record)}</UUID>\n<Type>${type}</Type>\n<ConfirmedExperimentally>${confirmed}</ConfirmedExperimentally>\n<Description>${description}</Description>\n<Created UTC="${created.utcAttr}">${created.snapDate}</Created>\n<LastModified UTC="${modified.utcAttr}">${modified.snapDate}</LastModified>\n<SequenceClass>${sequenceClass}</SequenceClass>\n<TransformedInto>${transformedInto}</TransformedInto>${organismXml}${accessionXml}${codeXml}${authorXml}${commentsXml}${mapLabelXml}${referencesXml}\n</Notes>`
}

function formatSnapGeneReferencesXml(references: string): string {
  const blocks = references
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (!blocks.length) return ''
  const entries = blocks
    .map((block) => {
      const pmidMatch = block.match(/\bPMID:\s*(\d+)\b/i)
      const pmid = pmidMatch?.[1] ?? ''
      const withoutPmid = block.replace(/\bPMID:\s*\d+\b/i, '').trim()
      const titleMatch = withoutPmid.match(/"([^"]+)"/)
      const title = titleMatch?.[1] ?? withoutPmid
      const authors = titleMatch
        ? withoutPmid.slice(0, titleMatch.index).replace(/[.\s]+$/, '').trim()
        : ''
      const journal = titleMatch
        ? withoutPmid.slice((titleMatch.index ?? 0) + titleMatch[0].length).replace(/^[.\s]+/, '').trim()
        : ''
      const attrs = [
        authors ? `authors="${xmlEscape(authors)}"` : '',
        title ? `title="${xmlEscape(title)}"` : '',
        journal ? `journal="${xmlEscape(journal)}"` : '',
        pmid ? `pubMedID="${xmlEscape(pmid)}"` : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `<Reference ${attrs}/>`
    })
    .join('')
  return `\n<References>\n${entries}\n</References>`
}

export function exportSnapGeneFeaturesXmlNative(record: SequenceRecord) {
  const features = snapGeneExportFeatures(record)
  const nextValidId = features.length
  const featuresXml = features
    .map((feature, index) => {
      const recentId = nextValidId - 1 - index
      const directionality = ({ none: 0, forward: 1, reverse: 2, both: 3 } as const)[featureDirectionality(feature)]
      const gatewayAtt = isSnapGeneGatewayLrAttFeature(feature)
      const swapped =
        directionality === 2 &&
        (gatewayAtt ||
          feature.locations.some((location) => location.end <= location.start))
          ? ' swappedSegmentNumbering="1"'
          : ''
      const prioritize = feature.prioritizeDisplay ? ' prioritize="1"' : ''
      const visibleAttr = feature.visible === false ? ' visible="0"' : ''
      const cleavage = formatSnapGeneCleavageArrows(feature.cleavageArrows)
      const cleavageAttr = cleavage ? ` cleavageArrows="${cleavage}"` : ''
      const translationAttrs = snapGeneFeatureTranslationAttrs(feature)
      const segments = feature.locations
        .map((location) => {
          const range =
            location.end <= location.start && record.topology === 'circular'
              ? `${location.start + 1}-${location.end}`
              : `${location.start + 1}-${location.end}`
          return `<Segment range="${range}" color="${xmlEscape(feature.color)}" type="standard"${snapGeneSegmentTranslatedAttr(feature)}/>`
        })
        .join('')
      const translationQualifiers = exportSnapGeneTranslationQualifiers(feature, record.sequence, record.topology)
      const consecutiveNumberingAttr = feature.translateInSequenceView
        ? ''
        : ' consecutiveTranslationNumbering="1"'
      // SnapGene/Addgene Gateway features use: name, directionality, type (not type before directionality).
      return `<Feature recentID="${recentId}" name="${xmlEscape(feature.name)}" directionality="${directionality}" type="${xmlEscape(feature.type)}"${swapped}${prioritize}${visibleAttr}${cleavageAttr}${translationAttrs}${consecutiveNumberingAttr} allowSegmentOverlaps="0">${segments}${exportSnapGeneFeatureQualifiersXml(feature)}${translationQualifiers}</Feature>`
    })
    .join('')
  return `<?xml version="1.0"?><Features nextValidID="${nextValidId}">${featuresXml}</Features>`
}

export function exportSnapGenePrimersXmlNative(
  record: SequenceRecord,
  modern = true,
  hybridization?: PrimerHybridizationParams,
) {
  const hybridizationParams = hybridizationParamsXml(hybridization, modern)
  const primers = resolvePrimerBindingsForExport(record)
    .map(({ primer, bindings }, index) => {
      const primerAttrs = [
        `recentID="${index}"`,
        `name="${xmlEscape(primer.name)}"`,
        `sequence="${xmlEscape(primer.sequence.toLowerCase())}"`,
        `color="${xmlEscape(primer.color)}"`,
        primer.description ? `description="${escapeSnapGenePrimerDescription(primer.description)}"` : '',
        primer.visible === false ? 'visible="0"' : '',
      ].filter(Boolean).join(' ')

      const bindingSites = bindings.flatMap((binding) => {
        if (!modern) return [exportBindingSiteXml(binding)]
        return [exportBindingSiteXml(binding), exportBindingSiteXml(binding, true)]
      }).join('')

      return `<Primer ${primerAttrs}>${bindingSites}</Primer>`
    })
    .join('')

  const nextValidId = record.primers.length
  return `<?xml version="1.0"?><Primers nextValidID="${nextValidId}">${hybridizationParams}${primers}</Primers>`
}

export function exportSnapGeneBlock8XmlNative(record?: SequenceRecord) {
  return exportSnapGeneBlock8Xml(resolveDnaEnds(record ?? { dnaEnds: undefined }))
}
