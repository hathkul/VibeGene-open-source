import { normalizeDnaEnds } from './dnaEnds'
import { sanitizeSequenceForMolecule } from './sequence'
import { proteinBondStrokeWidth } from './proteinBonds'
import { normalizeProteinFeatures } from './proteinFeatures'
import { normalizeProteinComparisonVariableRegions } from './proteinComparisonVariableRegions'
import { snapshotProteinSourceDna } from './proteinTranslationProvenance'
import { normalizeGuideScanDesignCache } from './guidescan/designCache'
import { normalizeLibraryMemberHistoryStorage } from './libraryMemberHistory'
import { normalizePrimerColor } from './primerColors'
import { normalizeSavedSangerAlleleAnalysis } from './sangerAlleles/savedAnalysis'
import type { ConstructProperties, DnaDocumentData, HostMethylationStatus, ProteinBond, ProteinDocumentData, ProteinNumberingRegion, ProteinTranslationDerivation, SequenceRecord } from './types'

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
}

function normalizeProteinNumberingRegion(
  region: ProteinNumberingRegion,
  sequenceLength: number,
): ProteinNumberingRegion | null {
  const sequenceStart = clampInteger(region.sequenceStart, 0, sequenceLength, 0)
  const sequenceEnd = clampInteger(region.sequenceEnd, 0, sequenceLength, sequenceLength)
  if (!region.id || sequenceEnd <= sequenceStart) return null
  return {
    id: region.id,
    ...(region.name?.trim() ? { name: region.name.trim() } : {}),
    sequenceStart,
    sequenceEnd,
    startAt: clampInteger(region.startAt, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1),
  }
}

function normalizeProteinBond(bond: ProteinBond, sequenceLength: number): ProteinBond | null {
  if (!bond.id || !Array.isArray(bond.endpoints) || bond.endpoints.length !== 2 || sequenceLength === 0) return null
  const normalizeEndpoint = (endpoint: ProteinBond['endpoints'][number]) => ({
    residue: clampInteger(
      endpoint?.residue,
      0,
      endpoint?.chainId?.trim() ? Number.MAX_SAFE_INTEGER : sequenceLength - 1,
      0,
    ),
    ...(endpoint?.chainId?.trim() ? { chainId: endpoint.chainId.trim() } : {}),
  })
  const knownTypes: ProteinBond['type'][] = ['disulfide', 'thioether', 'thiolester', 'cross-link', 'other']
  const type = knownTypes.includes(bond.type) ? bond.type : 'other'
  const defaultColor = type === 'thioether'
    ? '#6d28d9'
    : type === 'thiolester'
      ? '#be185d'
      : type === 'cross-link'
        ? '#0e7490'
        : type === 'other'
          ? '#475569'
          : '#b45309'
  return {
    id: bond.id,
    name: bond.name?.trim() || 'Bond',
    type,
    endpoints: [normalizeEndpoint(bond.endpoints[0]), normalizeEndpoint(bond.endpoints[1])],
    color: bond.color?.trim() || defaultColor,
    strokeWidth: proteinBondStrokeWidth(bond),
    visible: bond.visible === false ? false : undefined,
    showLabel: bond.showLabel === false ? false : undefined,
    showTypeLabel: bond.showTypeLabel === true ? true : undefined,
    ...(bond.notes?.trim() ? { notes: bond.notes.trim() } : {}),
  }
}

function normalizeTranslationDerivation(
  derivation: ProteinDocumentData['translationDerivation'],
): ProteinTranslationDerivation | undefined {
  if (derivation?.kind !== 'translated-cds') return undefined
  const sources = (derivation.sources ?? [])
    .filter((source) => source && typeof source.projectName === 'string')
    .map((source) => {
      const { cds, sourceRecord, ...base } = source
      const validSourceRecord = isValidProteinSourceRecord(sourceRecord) ? sourceRecord : undefined
      return {
        ...base,
        projectName: source.projectName?.trim() || validSourceRecord?.name || 'Source DNA',
        sequenceDigest: source.sequenceDigest?.trim() || '',
        retention: validSourceRecord
          ? 'complete' as const
          : cds
            ? 'cds-only' as const
            : 'reference-only' as const,
        ...(cds
          ? {
              cds: {
                ...cds,
                featureName: cds.featureName?.trim() || 'CDS',
                locations: (cds.locations ?? []).map((location) => ({ ...location })),
                translation: {
                  ...cds.translation,
                  segmentNumbering: (cds.translation?.segmentNumbering ?? [])
                    .map((segment) => ({ ...segment })),
                },
              },
            }
          : {}),
        ...(validSourceRecord
          ? { sourceRecord: normalizeProteinSourceRecord(validSourceRecord) }
          : {}),
      }
    })
  return sources.length
    ? { kind: 'translated-cds', createdAt: derivation.createdAt || '', sources }
    : undefined
}

function isValidProteinSourceRecord(record: SequenceRecord | undefined): record is SequenceRecord {
  return Boolean(
    record
    && record.molecule === 'dna'
    && typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.sequence === 'string'
    && Array.isArray(record.features)
    && Array.isArray(record.primers)
    && Array.isArray(record.operations)
    && record.construct
    && typeof record.construct === 'object',
  )
}

function normalizeProteinSourceRecord(
  record: SequenceRecord | undefined,
): SequenceRecord | undefined {
  if (record?.molecule !== 'dna') return undefined
  if (!record.protein && !record.traceFiles) return record
  return snapshotProteinSourceDna(record)
}

export function normalizeProteinDocumentData(
  data: Partial<ProteinDocumentData> | undefined,
  sequenceLength: number,
): ProteinDocumentData {
  const sortedNumberingRegions = (data?.numberingRegions ?? [])
    .map((region) => normalizeProteinNumberingRegion(region, sequenceLength))
    .filter((region): region is ProteinNumberingRegion => Boolean(region))
    .sort((left, right) => left.sequenceStart - right.sequenceStart || left.sequenceEnd - right.sequenceEnd)
  const numberingRegions = sortedNumberingRegions.reduce<ProteinNumberingRegion[]>((accepted, region) => {
    const previous = accepted.at(-1)
    if (!previous || region.sequenceStart >= previous.sequenceEnd) accepted.push(region)
    return accepted
  }, [])
  const translationDerivation = normalizeTranslationDerivation(data?.translationDerivation)
  return {
    numberingStart: clampInteger(data?.numberingStart, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1),
    numberingRegions,
    bonds: (data?.bonds ?? [])
      .map((bond) => normalizeProteinBond(bond, sequenceLength))
      .filter((bond): bond is ProteinBond => Boolean(bond)),
    ...(data?.userColors ? { userColors: data.userColors } : {}),
    comparisonSources: (data?.comparisonSources ?? [])
      .filter((source) => source && typeof source.id === 'string' && typeof source.sequence === 'string')
      .map((source) => {
        const kind: 'dna' | 'protein' = source.kind === 'dna' ? 'dna' : 'protein'
        return {
          id: source.id,
          name: source.name?.trim() || source.fileName?.trim() || 'Comparison sequence',
          ...(source.fileName?.trim() ? { fileName: source.fileName.trim() } : {}),
          kind,
          sequence: sanitizeSequenceForMolecule(source.sequence, kind),
          enabled: source.enabled !== false,
          disabledFrameShiftKeys: (source.disabledFrameShiftKeys ?? [])
            .filter((key): key is string => typeof key === 'string'),
        }
      })
      .filter((source) => source.sequence.length > 0),
    comparisonVariableRegions: normalizeProteinComparisonVariableRegions(
      data?.comparisonVariableRegions ?? [],
      sequenceLength,
    ),
    comparisonAlignmentCache: (data?.comparisonAlignmentCache ?? [])
      .filter((entry) => entry
        && typeof entry.sourceId === 'string'
        && typeof entry.signature === 'string'
        && (entry.alignment === null || (typeof entry.alignment === 'object' && Array.isArray(entry.alignment.columns))))
      .map((entry) => ({
        sourceId: entry.sourceId,
        signature: entry.signature,
        alignment: entry.alignment,
        ...(typeof entry.error === 'string' && entry.error ? { error: entry.error } : {}),
      })),
    ...(data?.binderNumbering ? { binderNumbering: data.binderNumbering } : {}),
    ...(data?.binderStructure ? { binderStructure: data.binderStructure } : {}),
    ...(data?.sourceDatabase?.trim() ? { sourceDatabase: data.sourceDatabase.trim() } : {}),
    ...(data?.sourceAccession?.trim() ? { sourceAccession: data.sourceAccession.trim() } : {}),
    ...(data?.retrievedAt?.trim() ? { retrievedAt: data.retrievedAt.trim() } : {}),
    ...(translationDerivation ? { translationDerivation } : {}),
  }
}

export function normalizeDnaDocumentData(
  data: Partial<DnaDocumentData> | undefined,
  legacyComparisonTraces: SequenceRecord['traceFiles'] = [],
): DnaDocumentData {
  const sources = (data?.comparisonSources?.length
    ? data.comparisonSources
    : (legacyComparisonTraces ?? [])
        .filter((trace) => trace.alignmentPurpose === 'comparative')
        .map((trace) => ({
          id: trace.id,
          name: trace.fileName,
          fileName: trace.fileName,
          sequence: trace.sequence,
          enabled: trace.enabled,
        })))
    .filter((source) => source && typeof source.id === 'string' && typeof source.sequence === 'string')
    .map((source) => ({
      id: source.id,
      name: source.name?.trim() || source.fileName?.trim() || 'Comparison sequence',
      ...(source.fileName?.trim() ? { fileName: source.fileName.trim() } : {}),
      sequence: sanitizeSequenceForMolecule(source.sequence, 'dna'),
      enabled: source.enabled !== false,
    }))
    .filter((source) => source.sequence.length > 0)

  const genomicAnchor = normalizeGenomicAnchor(data?.genomicAnchor)
  const guideScanDesignCache = normalizeGuideScanDesignCache(data?.guideScanDesignCache)
  const sangerAlleleAnalysis = normalizeSavedSangerAlleleAnalysis(data?.sangerAlleleAnalysis)
  const libraryMemberHistory = normalizeLibraryMemberHistoryStorage(
    data?.libraryMemberHistory,
    data?.libraryMemberHistoryPool,
  )

  return {
    ...(data?.documentRole === 'library' ? { documentRole: 'library' as const } : {}),
    ...(typeof data?.libraryReferenceMemberId === 'string' && data.libraryReferenceMemberId.trim()
      ? { libraryReferenceMemberId: data.libraryReferenceMemberId.trim() }
      : {}),
    ...(data?.libraryConsensusEnabled === false ? { libraryConsensusEnabled: false } : {}),
    comparisonSources: sources,
    comparisonAlignmentCache: (data?.comparisonAlignmentCache ?? [])
      .filter((entry) => entry
        && typeof entry.sourceId === 'string'
        && typeof entry.signature === 'string'
        && (entry.alignment === null
          || (typeof entry.alignment === 'object' && Array.isArray(entry.alignment.columns))))
      .map((entry) => ({
        sourceId: entry.sourceId,
        signature: entry.signature,
        alignment: entry.alignment,
        ...(typeof entry.error === 'string' && entry.error ? { error: entry.error } : {}),
      })),
    ...((data?.libraryMemberFeatures?.length
      ? {
          libraryMemberFeatures: data.libraryMemberFeatures
            .filter((entry) => entry && typeof entry.memberId === 'string' && Array.isArray(entry.features))
            .map((entry) => ({
              memberId: entry.memberId,
              ...(typeof entry.fileName === 'string' && entry.fileName.trim()
                ? { fileName: entry.fileName.trim() }
                : {}),
              features: entry.features,
            }))
            .filter((entry) => entry.features.length > 0),
        }
      : {})),
    ...((data?.libraryMemberPrimers?.length
      ? {
          libraryMemberPrimers: data.libraryMemberPrimers
            .filter((entry) => entry && typeof entry.memberId === 'string' && Array.isArray(entry.primers))
            .map((entry) => ({
              memberId: entry.memberId,
              ...(typeof entry.fileName === 'string' && entry.fileName.trim()
                ? { fileName: entry.fileName.trim() }
                : {}),
              primers: entry.primers,
            }))
            .filter((entry) => entry.primers.length > 0),
        }
      : {})),
    ...(libraryMemberHistory.entries.length
      ? {
          libraryMemberHistory: libraryMemberHistory.entries,
          ...(libraryMemberHistory.pool ? { libraryMemberHistoryPool: libraryMemberHistory.pool } : {}),
        }
      : {}),
    ...((data?.libraryMemberReads?.length
      ? {
          libraryMemberReads: data.libraryMemberReads
            .filter((entry) => entry && typeof entry.memberId === 'string' && Array.isArray(entry.reads))
            .map((entry) => ({
              memberId: entry.memberId,
              fileName: typeof entry.fileName === 'string' ? entry.fileName : 'Member',
              sequence: typeof entry.sequence === 'string' ? entry.sequence : '',
              ...(entry.sequenceAssembled ? { sequenceAssembled: true as const } : {}),
              reads: entry.reads
                .filter((read) => read && typeof read.id === 'string' && typeof read.sequence === 'string')
                .map((read) => ({
                  id: read.id,
                  fileName: typeof read.fileName === 'string' ? read.fileName : 'Read',
                  sequence: read.sequence,
                  enabled: read.enabled !== false,
                  ...(typeof read.fileLastModified === 'number' ? { fileLastModified: read.fileLastModified } : {}),
                  ...(read.sequenceEdited ? { sequenceEdited: true as const } : {}),
                  ...(typeof read.parseError === 'string' && read.parseError ? { parseError: read.parseError } : {}),
                  ...(Array.isArray(read.baseCalls) ? { baseCalls: read.baseCalls.filter((base): base is string => typeof base === 'string') } : {}),
                  ...(Array.isArray(read.qualNums) ? { qualNums: read.qualNums.filter((value): value is number => typeof value === 'number') } : {}),
                })),
            }))
            .filter((entry) => entry.reads.length > 0),
        }
      : {})),
    ...(genomicAnchor ? { genomicAnchor } : {}),
    ...(guideScanDesignCache ? { guideScanDesignCache } : {}),
    ...(sangerAlleleAnalysis ? { sangerAlleleAnalysis } : {}),
  }
}

function normalizeGenomicAnchor(raw: import('./dnaComparisonTypes').GenomicReferenceAnchor | undefined) {
  if (!raw || typeof raw !== 'object') return undefined
  const organism = typeof raw.organism === 'string' ? raw.organism.trim() : ''
  const chromosome = typeof raw.chromosome === 'string' ? raw.chromosome.trim() : ''
  const start = typeof raw.start === 'number' && Number.isFinite(raw.start) ? raw.start : null
  const end = typeof raw.end === 'number' && Number.isFinite(raw.end) ? raw.end : null
  const strand = raw.strand === 'reverse' ? 'reverse' as const : raw.strand === 'forward' ? 'forward' as const : null
  if (!organism || !chromosome || start == null || end == null || !strand) return undefined
  return { organism, chromosome, start, end, strand }
}

export function normalizeSequenceRecord(record: SequenceRecord): SequenceRecord {
  const molecule = record.molecule === 'protein' || record.molecule === 'rna' ? record.molecule : 'dna'
  const sequence = sanitizeSequenceForMolecule(record.sequence ?? '', molecule)
  if (molecule === 'protein') {
    return {
      ...record,
      molecule,
      topology: 'linear',
      sequence,
      protein: normalizeProteinDocumentData(record.protein, sequence.length),
      dna: undefined,
      features: normalizeProteinFeatures(record.features ?? [], sequence.length),
      primers: [],
      traceFiles: undefined,
      strandColors: undefined,
      snapGeneEnzymes: undefined,
      fileEnzymeSets: undefined,
      dnaEnds: undefined,
      dnaEndsProvenance: undefined,
      construct: normalizeConstructProperties(record.construct),
    }
  }
  return {
    ...record,
    molecule,
    sequence,
    protein: undefined,
    dna: molecule === 'dna' ? normalizeDnaDocumentData(record.dna, record.traceFiles) : undefined,
    traceFiles: record.traceFiles?.filter((trace) => trace.alignmentPurpose !== 'comparative'),
    dnaEnds: molecule === 'dna' ? normalizeDnaEnds(record.dnaEnds) : undefined,
    dnaEndsProvenance: molecule === 'dna' ? record.dnaEndsProvenance : undefined,
    primers: (record.primers ?? []).map((primer) => ({
      ...primer,
      color: normalizePrimerColor(primer.color),
    })),
    construct: normalizeConstructProperties(record.construct),
  }
}

export type LaboratoryHostOption = {
  value: string
  label: string
  group: string
}

export type TransformationStrainOption = {
  id: string
  label: string
  methylation: HostMethylationStatus
}

export type SequenceClassOption = {
  value: string
  label: string
}

export const laboratoryHostOptions: LaboratoryHostOption[] = [
  { value: '', label: 'Unspecified', group: 'General' },
  { value: 'prokaryotic', label: 'Prokaryotic (general)', group: 'General' },
  { value: 'eukaryotic', label: 'Eukaryotic (general)', group: 'General' },
  { value: 'plant', label: 'Plant (general)', group: 'General' },
  { value: 'mammal', label: 'Mammal (general)', group: 'General' },
  { value: 'escherichia-coli', label: 'Escherichia coli', group: 'Bacterial' },
  { value: 'bacillus-subtilis', label: 'Bacillus subtilis', group: 'Bacterial' },
  { value: 'salmonella-typhimurium', label: 'Salmonella enterica serovar Typhimurium', group: 'Bacterial' },
  { value: 'pseudomonas-aeruginosa', label: 'Pseudomonas aeruginosa', group: 'Bacterial' },
  { value: 'agrobacterium-tumefaciens', label: 'Agrobacterium tumefaciens', group: 'Bacterial' },
  { value: 'saccharomyces-cerevisiae', label: 'Saccharomyces cerevisiae', group: 'Yeast' },
  { value: 'pichia-pastoris', label: 'Pichia pastoris', group: 'Yeast' },
  { value: 'schizosaccharomyces-pombe', label: 'Schizosaccharomyces pombe', group: 'Yeast' },
  { value: 'arabidopsis-thaliana', label: 'Arabidopsis thaliana', group: 'Plant' },
  { value: 'nicotiana-benthamiana', label: 'Nicotiana benthamiana', group: 'Plant' },
  { value: 'zea-mays', label: 'Zea mays', group: 'Plant' },
  { value: 'homo-sapiens', label: 'Homo sapiens', group: 'Mammalian' },
  { value: 'mus-musculus', label: 'Mus musculus', group: 'Mammalian' },
  { value: 'rattus-norvegicus', label: 'Rattus norvegicus', group: 'Mammalian' },
  { value: 'danio-rerio', label: 'Danio rerio', group: 'Other eukaryotic' },
  { value: 'drosophila-melanogaster', label: 'Drosophila melanogaster', group: 'Other eukaryotic' },
  { value: 'caenorhabditis-elegans', label: 'Caenorhabditis elegans', group: 'Other eukaryotic' },
  { value: 'spodoptera-frugiperda', label: 'Spodoptera frugiperda', group: 'Other eukaryotic' },
]

export const transformationStrainOptions: TransformationStrainOption[] = [
  // Methylation presets from published genotypes:
  // Dam/Dcm absent from genotype → present (+); explicit dam/dcm/Δdcm → absent (−).
  // EcoKI+: hsdR(rK− mK+) / hsdR2; EcoKI−: Δ(hsdRMS…) / hsdS(r− m−) / B-system strains.
  { id: '', label: 'Unspecified', methylation: { dam: false, dcm: false, ecoKI: false } },
  { id: 'dh5alpha', label: 'DH5α', methylation: { dam: true, dcm: true, ecoKI: true } }, // hsdR17(rK− mK+)
  { id: 'dh10b', label: 'DH10B', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mrr-hsdRMS-mcrBC)
  { id: 'top10', label: 'TOP10', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mrr-hsdRMS-mcrBC)
  { id: 'mach1', label: 'Mach1-T1R', methylation: { dam: true, dcm: true, ecoKI: true } }, // hsdR17(rK− mK+)
  { id: 'xl1-blue', label: 'XL1-Blue', methylation: { dam: true, dcm: true, ecoKI: true } }, // hsdR17(rK− mK+)
  { id: 'xl10-gold', label: 'XL10-Gold', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mcrCB-hsdSMR-mrr)
  { id: 'jm109', label: 'JM109', methylation: { dam: true, dcm: true, ecoKI: true } }, // hsdR17(rK− mK+)
  { id: 'tg1', label: 'TG1', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mcrB-hsdSM)5(rK− mK−)
  { id: 'neb5-alpha', label: 'NEB 5-alpha', methylation: { dam: true, dcm: true, ecoKI: true } }, // DH5α-like
  { id: 'turbo', label: 'Turbo Competent E. coli', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mcrB-hsdSM)5(rK− mK−)
  { id: 'stbl3', label: 'Stbl3', methylation: { dam: true, dcm: true, ecoKI: false } }, // no dam/dcm; hsdS20(rB− mB−)
  { id: 'neb-stable', label: 'NEB Stable', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mrr-hsdRMS-mcrBC)
  { id: 'sure', label: 'SURE', methylation: { dam: true, dcm: true, ecoKI: false } }, // no dam/dcm; Δ(mcrCB-hsdSMR-mrr)
  { id: 'sure2', label: 'SURE2', methylation: { dam: true, dcm: true, ecoKI: false } }, // no dam/dcm; Δ(mcrCB-hsdSMR-mrr)
  { id: 'gt116', label: 'GT116', methylation: { dam: true, dcm: false, ecoKI: false } }, // Δdcm; Δ(mrr-hsdRMS-mcrBC)
  { id: 'gm2163', label: 'GM2163', methylation: { dam: false, dcm: false, ecoKI: true } }, // dam13 dcm-6 hsdR2(mK+)
  { id: 'jm110', label: 'JM110', methylation: { dam: false, dcm: false, ecoKI: true } }, // dam dcm hsdR17(rK− mK+)
  { id: 'er2925', label: 'ER2925', methylation: { dam: false, dcm: false, ecoKI: true } }, // dam13 dcm-6 hsdR2(mK+)
  { id: 'hst08', label: 'HST08 Premium', methylation: { dam: true, dcm: true, ecoKI: false } }, // Δ(mrr-hsdRMS-mcrBC)
  { id: 'ccd-b', label: 'ccdB Survival T1R', methylation: { dam: true, dcm: true, ecoKI: false } }, // TOP10-like ΔhsdRMS
  { id: 'db3-1', label: 'DB3.1', methylation: { dam: true, dcm: true, ecoKI: false } }, // hsdS20(rB− mB−)
  { id: 'piri', label: 'Pir1 / Pir2', methylation: { dam: true, dcm: true, ecoKI: true } }, // DH5α λpir-like
  { id: 'bw25113', label: 'BW25113', methylation: { dam: true, dcm: true, ecoKI: true } }, // hsdR514(mK+)
  { id: 'bl21', label: 'BL21(DE3)', methylation: { dam: true, dcm: false, ecoKI: false } }, // E. coli B dcm; hsdSB
  { id: 'rosetta', label: 'Rosetta(DE3)', methylation: { dam: true, dcm: false, ecoKI: false } }, // BL21-derived
  { id: 'origami', label: 'Origami', methylation: { dam: true, dcm: true, ecoKI: true } }, // K-12 Origami/Origami2
]

/** SnapGene / GenBank division-style sequence classes for Natural DNA. */
export const sequenceClassOptions: SequenceClassOption[] = [
  { value: 'PRI', label: 'PRI - primate' },
  { value: 'ROD', label: 'ROD - rodent' },
  { value: 'MAM', label: 'MAM - other mammalian' },
  { value: 'VRT', label: 'VRT - other vertebrate' },
  { value: 'INV', label: 'INV - invertebrate' },
  { value: 'PLN', label: 'PLN - plant, fungal, and algal' },
  { value: 'BCT', label: 'BCT - bacterial' },
  { value: 'VRL', label: 'VRL - viral' },
  { value: 'PHG', label: 'PHG - bacteriophage' },
  { value: 'UNA', label: 'UNA - unannotated' },
  { value: 'EST', label: 'EST - expressed sequence tags' },
  { value: 'PAT', label: 'PAT - patent sequences' },
  { value: 'STS', label: 'STS - sequence tagged sites' },
  { value: 'GSS', label: 'GSS - genome survey sequences' },
  { value: 'HTG', label: 'HTG - high-throughput genomic' },
]

export const defaultConstructProperties: ConstructProperties = {
  syntheticDna: true,
  confirmedExperimentally: false,
  laboratoryHostOrganism: 'escherichia-coli',
  sourceOrganism: null,
  bacterialTransformationStrain: 'dh5alpha',
  hostMethylation: { dam: true, dcm: true, ecoKI: true },
  sequenceClass: 'UNA',
  accessionNumber: '',
  codeNumber: '',
  sequenceAuthor: 'VibeGene',
  comments: 'Local-first project. Data stays in this browser unless exported.',
  references: '',
}

export function normalizeConstructProperties(
  properties: Partial<ConstructProperties> | undefined,
): ConstructProperties {
  const sequenceClassRaw = (properties?.sequenceClass ?? defaultConstructProperties.sequenceClass).trim().toUpperCase()
  const knownClass = sequenceClassOptions.some((option) => option.value === sequenceClassRaw)
  return {
    syntheticDna: properties?.syntheticDna ?? defaultConstructProperties.syntheticDna,
    confirmedExperimentally:
      properties?.confirmedExperimentally ?? defaultConstructProperties.confirmedExperimentally,
    laboratoryHostOrganism:
      properties?.laboratoryHostOrganism ?? defaultConstructProperties.laboratoryHostOrganism,
    sourceOrganism: properties?.sourceOrganism ?? defaultConstructProperties.sourceOrganism,
    bacterialTransformationStrain:
      properties?.bacterialTransformationStrain ?? defaultConstructProperties.bacterialTransformationStrain,
    hostMethylation: {
      dam: properties?.hostMethylation?.dam ?? defaultConstructProperties.hostMethylation.dam,
      dcm: properties?.hostMethylation?.dcm ?? defaultConstructProperties.hostMethylation.dcm,
      ecoKI: properties?.hostMethylation?.ecoKI ?? defaultConstructProperties.hostMethylation.ecoKI,
    },
    sequenceClass: knownClass ? sequenceClassRaw : defaultConstructProperties.sequenceClass,
    accessionNumber: properties?.accessionNumber ?? defaultConstructProperties.accessionNumber,
    codeNumber: properties?.codeNumber ?? defaultConstructProperties.codeNumber,
    sequenceAuthor: properties?.sequenceAuthor ?? defaultConstructProperties.sequenceAuthor,
    comments: properties?.comments ?? defaultConstructProperties.comments,
    references: properties?.references ?? defaultConstructProperties.references,
  }
}

/**
 * Host methylation applies to Synthetic (lab) DNA grown in a host strain.
 * Natural DNA has no laboratory host methylation.
 */
export function effectiveHostMethylation(properties: ConstructProperties): HostMethylationStatus {
  if (!properties.syntheticDna) {
    return { dam: false, dcm: false, ecoKI: false }
  }
  return properties.hostMethylation
}

export function methylationForStrain(strainId: string | null): HostMethylationStatus {
  const strain = transformationStrainOptions.find((entry) => entry.id === (strainId ?? ''))
  return strain?.methylation ?? { dam: false, dcm: false, ecoKI: false }
}

export function laboratoryHostGroups() {
  const groups = new Map<string, LaboratoryHostOption[]>()
  for (const option of laboratoryHostOptions) {
    const list = groups.get(option.group) ?? []
    list.push(option)
    groups.set(option.group, list)
  }
  return groups
}

export function organismIdFromLabel(label: string | null | undefined): string | null {
  const normalized = (label ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'unspecified') return null
  const byValue = laboratoryHostOptions.find((option) => option.value === normalized)
  if (byValue) return byValue.value || null
  const byLabel = laboratoryHostOptions.find((option) => option.label.toLowerCase() === normalized)
  if (byLabel) return byLabel.value || null
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const bySlug = laboratoryHostOptions.find((option) => option.value === slug)
  return bySlug?.value || null
}

export function organismLabelFromId(id: string | null | undefined): string {
  if (!id) return 'unspecified'
  return laboratoryHostOptions.find((option) => option.value === id)?.label ?? id
}

export function strainIdFromSnapGeneName(name: string | null | undefined): string | null {
  const normalized = (name ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'unspecified') return null
  const exact = transformationStrainOptions.find(
    (strain) => strain.id === normalized || strain.label.toLowerCase() === normalized,
  )
  if (exact) return exact.id || null
  const compact = normalized.replace(/[^a-z0-9]+/g, '')
  const fuzzy = transformationStrainOptions.find(
    (strain) => strain.label.toLowerCase().replace(/[^a-z0-9]+/g, '') === compact,
  )
  return fuzzy?.id || null
}

export function strainSnapGeneNameFromId(id: string | null | undefined): string {
  if (!id) return 'unspecified'
  return transformationStrainOptions.find((strain) => strain.id === id)?.label ?? id
}
