import { defaultConstructProperties, organismIdFromLabel, organismLabelFromId } from './constructProperties'
import { defaultFeatureTranslationOptions } from './geneticCode'
import { featureQualifierValues, parseFeatureQualifiers, syncTranslationQualifiers } from './featureQualifiers'
import { resolveGenBankFeatureName } from './genbankFeatureName'
import { hideGenesMatchingCds } from './featureVisibility'
import { PROTEIN_FEATURE_COLORS, type ProteinFeatureType } from './proteinFeatures'
import { inferProteinSequence, nucleotideAlphabet } from './fastaParser'
import { makeRecord, featureColors } from './parserRecord'
import { createId, normalizeDna, sanitizeSequenceForMolecule } from './sequence'
import { detectEmblTopology, detectGenBankTopology } from './sequenceTopology'
import { geneticCodeFromSnapGeneTranslTable } from './snapgeneFeatureTranslation'
import type { ConstructProperties, ProteinBond, SequenceFeature, SequenceRecord, Strand, Topology } from './types'

function parseLocation(rawLocation: string) {
  let value = rawLocation.trim().replace(/[<>]/g, '')
  let strand: Strand = 'forward'
  if (value.startsWith('complement(') && value.endsWith(')')) {
    strand = 'reverse'
    value = value.slice('complement('.length, -1)
  }
  if (value.startsWith('join(') && value.endsWith(')')) value = value.slice('join('.length, -1)

  return value.split(',').flatMap((part) => {
    const match = part.match(/(\d+)\.\.(\d+)/)
    if (!match) {
      const singleBase = part.match(/(\d+)/)
      if (!singleBase) return []
      const start = Number(singleBase[1]) - 1
      return [{ start, end: start + 1, strand }]
    }
    return [{ start: Number(match[1]) - 1, end: Number(match[2]), strand }]
  })
}

function splitGenBankLocationAndQualifiers(locationLine: string, rest: string) {
  const lines = rest.split('\n')
  const locationParts = [locationLine.trim()]
  let index = 0
  for (; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('/')) break
    locationParts.push(trimmed)
  }
  return { location: locationParts.join(''), qualifiers: lines.slice(index).join('\n') }
}

function isGenPeptRecord(text: string, fileName: string, origin: string): boolean {
  const locusLine = text.match(/^LOCUS\s+.+$/m)?.[0] ?? ''
  if (/\b\d+\s+bp\b|\b(?:DNA|RNA|nucleotide)\b/i.test(locusLine)) return false
  if (/\b\d+\s+aa\b/i.test(locusLine)) return true
  const compactOrigin = origin.replace(/[^A-Za-z*]/g, '')
  if (compactOrigin.length > 0 && nucleotideAlphabet.test(compactOrigin)) return false
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'gp' || extension === 'gpff') return true
  return inferProteinSequence(origin, fileName)
}

function genPeptFeatureType(type: string, qualifiers: Record<string, string>): ProteinFeatureType {
  const normalizedType = type.toLowerCase()
  const detail = `${qualifiers.region_name ?? ''} ${qualifiers.site_type ?? ''}`.toLowerCase()
  if (normalizedType === 'region') {
    if (detail.includes('domain')) return 'domain'
    if (detail.includes('repeat')) return 'repeat'
    if (detail.includes('motif')) return 'motif'
    return 'region'
  }
  if (normalizedType === 'site') {
    if (detail.includes('active')) return 'active site'
    if (detail.includes('metal')) return 'metal binding'
    if (detail.includes('binding')) return 'binding site'
    if (detail.includes('glycosyl')) return 'glycosylation'
    if (detail.includes('lipid')) return 'lipidation'
    if (detail.includes('modified')) return 'modified residue'
    return 'site'
  }
  const aliases: Record<string, ProteinFeatureType> = {
    mat_peptide: 'chain', peptide: 'chain', sig_peptide: 'signal peptide', transit_peptide: 'transit peptide',
    transmembrane: 'transmembrane', coiled_coil: 'coiled coil', repeat_region: 'repeat', domain: 'domain',
  }
  return aliases[normalizedType] ?? 'other'
}

function genPeptBondType(value: string): ProteinBond['type'] {
  const normalized = value.toLowerCase()
  if (normalized.includes('disulfide')) return 'disulfide'
  if (normalized.includes('thioether')) return 'thioether'
  if (normalized.includes('thiolester')) return 'thiolester'
  if (normalized.includes('cross') || normalized.includes('covalent')) return 'cross-link'
  return 'other'
}

export function parseGenBank(text: string, fileName = 'GenBank import'): SequenceRecord {
  const locus = text.match(/^LOCUS\s+(\S+)/m)
  const definition = text.match(/^DEFINITION\s+([\s\S]*?)(?=^ACCESSION\s|\nFEATURES\s)/m)
  const accession = text.match(/^ACCESSION\s+(\S+)/m)?.[1]
  const source = text.match(/^SOURCE\s+(.+)$/m)?.[1]?.trim()
  const organism = text.match(/^ {2}ORGANISM\s+(.+)$/m)?.[1]?.trim()
  const commentBlock = text.match(/^COMMENT\s+([\s\S]*?)(?=^REFERENCE\s|^FEATURES\s|^ORIGIN\s)/m)?.[1]
  const comment = commentBlock?.split('\n').map((line) => line.replace(/^ {12}/, '').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const referenceBlocks = [...text.matchAll(/^REFERENCE\s+[^\n]*\n([\s\S]*?)(?=^REFERENCE\s|^COMMENT\s|^FEATURES\s|^ORIGIN\s)/gm)]
  const references = referenceBlocks.map((match) => {
    const block = match[1] ?? ''
    const authors = block.match(/^ {2}AUTHORS\s+([\s\S]*?)(?=^ {2}[A-Z]|^REFERENCE\s|^FEATURES\s)/m)?.[1]?.replace(/\s+/g, ' ').trim()
    const title = block.match(/^ {2}TITLE\s+([\s\S]*?)(?=^ {2}[A-Z]|^REFERENCE\s|^FEATURES\s)/m)?.[1]?.replace(/\s+/g, ' ').trim()
    const journal = block.match(/^ {2}JOURNAL\s+([\s\S]*?)(?=^ {2}[A-Z]|^REFERENCE\s|^FEATURES\s)/m)?.[1]?.replace(/\s+/g, ' ').trim()
    const pubmed = block.match(/PUBMED\s+(\d+)/)?.[1]
    return [authors, title ? `"${title}"` : '', journal, pubmed ? `PMID: ${pubmed}` : ''].filter(Boolean).join(' ')
  }).filter(Boolean).join('\n\n')
  const origin = text.match(/^ORIGIN\s+([\s\S]*?)\/\//m)
  const originText = origin?.[1] ?? ''
  const molecule = isGenPeptRecord(text, fileName, originText) ? 'protein' : 'dna'
  const sequence = molecule === 'protein' ? sanitizeSequenceForMolecule(originText, molecule).toUpperCase() : normalizeDna(originText)
  const topology = (detectGenBankTopology(text) ?? 'circular') as Topology
  const featureBlock = text.match(/^FEATURES\s+Location\/Qualifiers\s*\n([\s\S]*?)(?=^ORIGIN\s)/m)?.[1] ?? ''
  const featureMatches = [...featureBlock.matchAll(/^\s{5}(\S+)\s+(.+)([\s\S]*?)(?=^\s{5}\S+\s+|(?![\s\S]))/gm)]
  const drafts = featureMatches.map((match) => {
    const type = match[1]!
    const { location, qualifiers } = splitGenBankLocationAndQualifiers(match[2]!, match[3] ?? '')
    const locations = parseLocation(location)
    const notes = qualifiers.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
    return { type, qualifiers, notes, locations, location }
  })
  const cdsRanges = drafts.filter((draft) => draft.type === 'CDS').flatMap((draft) => draft.locations)
  const features: SequenceFeature[] = drafts.flatMap((draft) => {
    const parsedQualifiers = parseFeatureQualifiers(draft.notes)
    if (molecule === 'protein' && draft.type.toLowerCase() === 'bond') return []
    const hasTranslation = Boolean(parsedQualifiers.translation?.trim())
    const translTable = Number(parsedQualifiers.transl_table)
    const proteinType = genPeptFeatureType(draft.type, parsedQualifiers)
    const proteinName = parsedQualifiers.region_name || (parsedQualifiers.site_type ? `${parsedQualifiers.site_type} site` : '')
    return [{
      id: createId('feature'),
      name: molecule === 'protein' ? proteinName || resolveGenBankFeatureName(draft.type, draft.qualifiers, { locations: draft.locations, cdsRanges }) : resolveGenBankFeatureName(draft.type, draft.qualifiers, { locations: draft.locations, cdsRanges }),
      type: molecule === 'protein' ? proteinType : draft.type,
      color: molecule === 'protein' ? PROTEIN_FEATURE_COLORS[proteinType] : featureColors[draft.type] ?? featureColors.misc_feature,
      notes: draft.notes,
      locations: draft.locations.map((location) => ({ ...location, strand: molecule === 'protein' ? 'forward' as const : location.strand })),
      ...(molecule !== 'protein' && hasTranslation ? { translateInSequenceView: true, translation: { ...defaultFeatureTranslationOptions(Math.max(1, draft.locations.length)), geneticCode: geneticCodeFromSnapGeneTranslTable(Number.isFinite(translTable) ? translTable : null) } } : {}),
    }]
  })
  const bonds: ProteinBond[] = molecule === 'protein' ? drafts.flatMap((draft) => {
    if (draft.type.toLowerCase() !== 'bond') return []
    const positions = [...draft.location.matchAll(/\d+/g)].map((match) => Number(match[0]) - 1)
    if (positions.length < 2 || positions[0]! < 0 || positions[1]! < 0) return []
    const qualifiers = parseFeatureQualifiers(draft.notes)
    const description = qualifiers.bond_type || qualifiers.note || 'Bond'
    return [{ id: createId('bond'), name: qualifiers.note || qualifiers.bond_type || 'Bond', type: genPeptBondType(description), endpoints: [{ residue: positions[0]! }, { residue: positions[1]! }], ...(draft.notes ? { notes: draft.notes } : {}) }]
  }) : []
  const organismId = organismIdFromLabel(organism || source)
  const looksNatural = Boolean(organism || accession)
  return makeRecord({
    name: locus?.[1] ?? 'GenBank import', description: definition?.[1]?.replace(/\s+/g, ' ').trim() ?? '', molecule,
    topology: molecule === 'protein' ? 'linear' : topology, sequence,
    features: molecule === 'protein' ? features : hideGenesMatchingCds(features),
    protein: molecule === 'protein' ? { numberingStart: 1, numberingRegions: [], bonds, sourceDatabase: 'NCBI Protein', ...(accession && accession !== '.' ? { sourceAccession: accession } : {}) } : undefined,
    construct: { ...defaultConstructProperties, syntheticDna: !looksNatural, sourceOrganism: looksNatural ? organismId : defaultConstructProperties.sourceOrganism, laboratoryHostOrganism: looksNatural ? defaultConstructProperties.laboratoryHostOrganism : organismId ?? defaultConstructProperties.laboratoryHostOrganism, accessionNumber: accession && accession !== '.' ? accession : '', comments: comment ?? '', references, sequenceAuthor: '' },
  })
}

export function parseEmbl(text: string, fileName = 'EMBL import'): SequenceRecord {
  const idLine = text.match(/^ID\s+(\S+)/m)?.[1]?.replace(/;+$/, '') ?? fileName.replace(/\.[^.]+$/, '')
  const accession = text.match(/^AC\s+([^;.\s]+)/m)?.[1]
  const definition = [...text.matchAll(/^DE\s+(.+)$/gm)].map((match) => match[1]!.trim()).join(' ')
  const organism = text.match(/^OS\s+(.+)$/m)?.[1]?.trim()
  const comment = [...text.matchAll(/^CC\s+(.*)$/gm)].map((match) => match[1]!.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const sqMatch = text.match(/^SQ\s+[^\n]*\n([\s\S]*?)(?=^\/\/)/m)
  const sequence = normalizeDna(sqMatch?.[1] ?? '')
  const topology = (detectEmblTopology(text) ?? 'circular') as Topology
  const featureBlock = text.match(/^FT\s+([\s\S]*?)(?=^XX\s*$|^SQ\s+)/m)?.[0] ?? ''
  const featureMatches = [...featureBlock.matchAll(/^FT\s+(\S+)\s+(\S.*)$\n?((?:^FT\s{15,}.*$\n?)*)/gm)]
  const drafts = featureMatches.map((match) => {
    const type = match[1]!
    const locationParts = [match[2]!.trim()]
    const continuation = (match[3] ?? '').split('\n').map((line) => line.replace(/^FT\s*/, '')).filter(Boolean)
    const qualifierLines: string[] = []
    for (const line of continuation) {
      if (line.trimStart().startsWith('/')) qualifierLines.push(line.trim())
      else if (qualifierLines.length === 0) locationParts.push(line.trim())
      else qualifierLines.push(line.trim())
    }
    const location = locationParts.join('')
    const notes = qualifierLines.join(' ')
    return { type, qualifiers: notes, notes, locations: parseLocation(location) }
  })
  const cdsRanges = drafts.filter((draft) => draft.type === 'CDS').flatMap((draft) => draft.locations)
  const features: SequenceFeature[] = drafts.map((draft) => {
    const parsedQualifiers = parseFeatureQualifiers(draft.notes)
    const hasTranslation = Boolean(parsedQualifiers.translation?.trim())
    const translTable = Number(parsedQualifiers.transl_table)
    return { id: createId('feature'), name: resolveGenBankFeatureName(draft.type, draft.qualifiers, { locations: draft.locations, cdsRanges }), type: draft.type, color: featureColors[draft.type] ?? featureColors.misc_feature, notes: draft.notes, locations: draft.locations, ...(hasTranslation ? { translateInSequenceView: true, translation: { ...defaultFeatureTranslationOptions(Math.max(1, draft.locations.length)), geneticCode: geneticCodeFromSnapGeneTranslTable(Number.isFinite(translTable) ? translTable : null) } } : {}) }
  })
  const organismId = organismIdFromLabel(organism)
  const looksNatural = Boolean(organism || accession)
  return makeRecord({
    name: idLine || 'EMBL import', description: definition ?? '', topology, sequence, features: hideGenesMatchingCds(features),
    construct: { ...defaultConstructProperties, syntheticDna: !looksNatural, sourceOrganism: looksNatural ? organismId : defaultConstructProperties.sourceOrganism, laboratoryHostOrganism: looksNatural ? defaultConstructProperties.laboratoryHostOrganism : organismId ?? defaultConstructProperties.laboratoryHostOrganism, accessionNumber: accession ?? '', comments: comment ?? '', references: '', sequenceAuthor: '' },
  })
}

function locationToGenBank(feature: SequenceFeature) {
  const parts = feature.locations.map((location) => `${location.start + 1}..${location.end}`)
  const joined = parts.length > 1 ? `join(${parts.join(',')})` : parts[0]
  return feature.locations[0]?.strand === 'reverse' ? `complement(${joined})` : joined
}

export function exportGenBank(record: SequenceRecord) {
  const construct: ConstructProperties = { ...defaultConstructProperties, ...(record.construct ?? {}) }
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
  const isProtein = record.molecule === 'protein'
  const locus = isProtein ? `LOCUS       ${record.name.padEnd(16).slice(0, 16)} ${String(record.sequence.length).padStart(7)} aa            linear       ${date}` : `LOCUS       ${record.name.padEnd(16).slice(0, 16)} ${String(record.sequence.length).padStart(7)} bp    DNA     ${record.topology.padEnd(8)} ${date}`
  const header = [locus, `DEFINITION  ${record.description || record.name}.`, `ACCESSION   ${construct.accessionNumber.trim() || '.'}`, 'VERSION     .', ...(construct.syntheticDna ? construct.laboratoryHostOrganism ? [`SOURCE      ${organismLabelFromId(construct.laboratoryHostOrganism)}`, `  ORGANISM  ${organismLabelFromId(construct.laboratoryHostOrganism)}`] : [] : construct.sourceOrganism ? [`SOURCE      ${organismLabelFromId(construct.sourceOrganism)}`, `  ORGANISM  ${organismLabelFromId(construct.sourceOrganism)}`] : []), ...(construct.comments.trim() ? [`COMMENT     ${construct.comments.trim().replace(/\n/g, '\n            ')}`] : []), 'FEATURES             Location/Qualifiers']
  const features = record.features.flatMap((feature) => {
    const lines = [`     ${feature.type.padEnd(15)} ${locationToGenBank(feature)}`, `                     /label="${feature.name.replaceAll('"', "'")}"`]
    const qualifiers = isProtein ? parseFeatureQualifiers(feature.notes) : syncTranslationQualifiers(parseFeatureQualifiers(feature.notes), feature, record.sequence, record.topology)
    const qualifierEntries = Object.entries(qualifiers).filter(([key, value]) => key !== 'label' && value.trim())
    if (qualifierEntries.length) for (const [key, value] of qualifierEntries) for (const part of featureQualifierValues(value)) lines.push(`                     /${key}="${part.replaceAll('"', "'")}"`)
    else if (feature.notes?.trim()) lines.push(`                     /note="${feature.notes.replaceAll('"', "'")}"`)
    return lines
  })
  const sequenceLines = record.sequence.toLowerCase().match(/.{1,60}/g)?.map((line, index) => `${String(index * 60 + 1).padStart(9)} ${line.match(/.{1,10}/g)?.join(' ') ?? line}`)
  return [...header, ...features.filter(Boolean), 'ORIGIN', ...(sequenceLines ?? []), '//'].join('\n')
}

export function exportGenPept(record: SequenceRecord) {
  if (record.molecule !== 'protein') throw new Error('GenPept export requires a protein record.')
  return exportGenBank(record)
}
