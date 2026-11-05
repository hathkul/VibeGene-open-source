import { featureQualifierValues, parseFeatureQualifiers } from '../featureQualifiers'
import type { SequenceRecord } from '../types'
import { GUIDESCAN_ORGANISMS, guidescanOrganismMeta } from './organisms'
import { isLikelyEntrezGeneId } from './geneIdentity'

/** Stable identity used to decide whether an opened record can drive gene-mode design. */
export type GuideScanGeneIdentity =
  | { kind: 'ensembl_gene'; ensemblId: string; symbol: string }
  | { kind: 'entrez_gene'; entrezId: string; symbol?: string }

export type GuideScanRecordDesignEligibility =
  | {
      eligible: true
      /** Value suitable for GuideScan gene `query-text` (symbol or Entrez ID). */
      queryText: string
      identity: GuideScanGeneIdentity
      /** Supported GuideScan reference inferred from external metadata. */
      organism: string
      label: string
    }
  | {
      eligible: false
      reason: string
    }

export const GUIDESCAN_RECORD_REFERENCE_UNKNOWN_REASON =
  'GuideScan reference genome cannot be determined from this record\'s external metadata.'

/** Ensembl gene stable IDs (ENSG…, ENSMUSG…, ENSRNOG…, …). */
const ENSEMBL_GENE_ID = /^ENS([A-Z]{0,4})G\d{11,}(\.\d+)?$/i

function inferOrganismFromAssembly(assembly: string | undefined): string | null {
  const value = (assembly ?? '').toLowerCase()
  if (!value) return null
  if (value.includes('grch38') || value.includes('hg38') || value === 'grch38') return 'hg38'
  if (value.includes('t2t') || value.includes('chm13')) return 't2t_chm13'
  if (value.includes('grcm39') || value.includes('mm39')) return 'mm39'
  if (value.includes('grcm38') || value.includes('mm10')) return 'mm10'
  if (value.includes('rgsc') || value.includes('rn6') || value.includes('rnor_6')) return 'rn6'
  if (value.includes('bdgp6') || value.includes('dm6')) return 'dm6'
  if (value.includes('wbicel') || value.includes('ce11') || value.includes('wbcel235')) return 'ce11'
  if (value.includes('saccer3') || value.includes('r64')) return 'sacCer3'
  return null
}

function inferOrganismFromEnsemblId(ensemblId: string): string | null {
  const match = ENSEMBL_GENE_ID.exec(ensemblId.trim())
  if (!match) return null
  const speciesCode = (match[1] ?? '').toUpperCase()
  // Empty code → human (ENSG…)
  if (!speciesCode) return 'hg38'
  if (speciesCode === 'MUS') return 'mm39'
  if (speciesCode === 'RNO') return 'rn6'
  if (speciesCode === 'DAR') return null // zebrafish not in GuideScan catalog
  if (speciesCode === '') return 'hg38'
  return null
}

function sourceFeatureNotes(record: SequenceRecord): string {
  return record.features
    .filter((feature) => feature.type.toLowerCase() === 'source')
    .map((feature) => feature.notes ?? '')
    .join(' ')
}

function inferOrganismFromTaxonOrSpecies(record: SequenceRecord): string | null {
  const haystack = [
    record.externalSource?.assembly,
    record.description,
    record.construct?.sourceOrganism,
    record.construct?.sourceOrganism?.replace(/-/g, ' '),
    record.construct?.laboratoryHostOrganism,
    record.construct?.laboratoryHostOrganism?.replace(/-/g, ' '),
    sourceFeatureNotes(record),
  ].filter(Boolean).join(' ').toLowerCase()

  for (const meta of GUIDESCAN_ORGANISMS) {
    if (meta.taxonId && haystack.includes(meta.taxonId)) return meta.id
    if (meta.ensemblSpecies && haystack.includes(meta.ensemblSpecies.replace(/_/g, ' '))) return meta.id
    if (meta.ensemblSpecies && haystack.includes(meta.ensemblSpecies)) return meta.id
  }
  if (/\bhomo sapiens\b|\bhuman\b/.test(haystack)) return 'hg38'
  if (/\bmus musculus\b|\bmouse\b/.test(haystack)) return 'mm39'
  if (/\brattus norvegicus\b|\brat\b/.test(haystack)) return 'rn6'
  return null
}

function pickOrganism(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const id = candidate?.trim()
    if (id && guidescanOrganismMeta(id)) return id
  }
  return null
}

function ensemblGeneFromAccession(accession: string): string | null {
  const trimmed = accession.trim()
  const match = ENSEMBL_GENE_ID.exec(trimmed)
  if (!match) return null
  return trimmed.split('.')[0]!.toUpperCase()
}

/**
 * Entrez Gene ID only from explicit external identity — never from free-text descriptions.
 * Accepts numeric `externalSource.accession` (or versioned `12345.1`).
 */
function entrezGeneFromExternalSource(record: SequenceRecord): string | null {
  const source = record.externalSource
  if (!source) return null
  const accession = source.accession.trim()
  if (isLikelyEntrezGeneId(accession)) return accession
  const bare = accession.replace(/\.\d+$/, '')
  if (isLikelyEntrezGeneId(bare) && (source.database?.toLowerCase() === 'gene' || source.provider === 'ncbi')) {
    return bare
  }
  return null
}

const REFSEQ_GENE_ACCESSION = /^NG_\d+(\.\d+)?$/i
const GENE_ID_DB_XREF_VALUE = /^GeneID:\s*(\d{1,12})$/i
/** Files saved by earlier builds that split `/db_xref="GeneID:…"` into a bogus `GeneID` qualifier. */
const LEGACY_SPLIT_GENE_ID_QUALIFIER = /^\s*(\d{1,12})["']?\s*$/
/** NCBI DEFINITION form: `… (LRP1), RefSeqGene on chromosome 12.` */
const REFSEQ_GENE_DEFINITION_SYMBOL = /\(([A-Za-z][A-Za-z0-9-]*)\),\s*RefSeqGene\b/

function isNcbiRefSeqGeneAccession(accession: string, source: NonNullable<SequenceRecord['externalSource']>): boolean {
  if (!REFSEQ_GENE_ACCESSION.test(accession.trim())) return false
  const provider = source.provider?.toLowerCase()
  const database = source.database?.toLowerCase()
  return provider === 'ncbi'
    || database === 'nuccore'
    || database === 'nucleotide'
    || database === 'refseqgene'
    || database === 'refseq'
}

function refSeqGeneAccessionForRecord(record: SequenceRecord): string | null {
  const external = record.externalSource?.accession?.trim()
  if (external && REFSEQ_GENE_ACCESSION.test(external)) {
    if (record.externalSource && isNcbiRefSeqGeneAccession(external, record.externalSource)) {
      return external
    }
  }
  const constructAccession = record.construct?.accessionNumber?.trim()
  if (constructAccession && REFSEQ_GENE_ACCESSION.test(constructAccession)) {
    return constructAccession
  }
  return null
}

/** True when neither externalSource nor construct carries a non-empty accession. */
function recordHasNoAccession(record: SequenceRecord): boolean {
  const external = record.externalSource?.accession?.trim()
  const constructAccession = record.construct?.accessionNumber?.trim()
  return !external && !constructAccession
}

/** True when any present accession is not an NG_ RefSeqGene ID (blocks the RefSeqGene identity path). */
function recordHasNonNgAccession(record: SequenceRecord): boolean {
  const external = record.externalSource?.accession?.trim()
  if (external && !REFSEQ_GENE_ACCESSION.test(external)) return true
  const constructAccession = record.construct?.accessionNumber?.trim()
  if (constructAccession && !REFSEQ_GENE_ACCESSION.test(constructAccession)) return true
  return false
}

function entrezIdsFromNotes(notes: string | undefined): string[] {
  if (!notes) return []
  const qualifiers = parseFeatureQualifiers(notes)
  const ids: string[] = []
  for (const xref of featureQualifierValues(qualifiers.db_xref)) {
    const match = GENE_ID_DB_XREF_VALUE.exec(xref.trim())
    if (match) ids.push(match[1]!)
  }
  for (const legacy of featureQualifierValues(qualifiers.GeneID)) {
    const match = LEGACY_SPLIT_GENE_ID_QUALIFIER.exec(legacy)
    if (match) ids.push(match[1]!)
  }
  return ids
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function geneSymbolFromNotes(notes: string | undefined): string | undefined {
  return featureQualifierValues(parseFeatureQualifiers(notes).gene)[0]
}

function primaryRefSeqGeneSymbolFromDescription(description: string): string | null {
  const match = REFSEQ_GENE_DEFINITION_SYMBOL.exec(description)
  return match?.[1] ?? null
}

/**
 * Entrez Gene ID from a RefSeqGene record: primary symbol comes from the
 * canonical DEFINITION `(SYMBOL), RefSeqGene`, then an exact `/gene` feature
 * with exactly one `/db_xref="GeneID:…"` is required. Secondary overlapping
 * genes are ignored. No first/longest fallback when the description does not match.
 * Applies when the record has an NG_ accession or no accession at all; other
 * accessions exclude this path.
 */
function entrezGeneFromRefSeqGeneRecord(record: SequenceRecord): { entrezId: string; symbol: string } | null {
  if (recordHasNonNgAccession(record)) return null
  if (!refSeqGeneAccessionForRecord(record) && !recordHasNoAccession(record)) return null

  const primarySymbol = primaryRefSeqGeneSymbolFromDescription(record.description)
  if (!primarySymbol) return null

  const matchingGeneFeatures = record.features.filter((feature) => (
    feature.type.toLowerCase() === 'gene'
    && geneSymbolFromNotes(feature.notes) === primarySymbol
  ))
  if (!matchingGeneFeatures.length) return null

  const idsPerFeature = matchingGeneFeatures.map((feature) => unique(entrezIdsFromNotes(feature.notes)))
  if (idsPerFeature.some((ids) => ids.length !== 1)) return null
  const entrezIds = unique(idsPerFeature.map((ids) => ids[0]!))
  if (entrezIds.length !== 1) return null
  return { entrezId: entrezIds[0]!, symbol: primarySymbol }
}

function eligibleEntrezResult(
  record: SequenceRecord,
  entrezId: string,
  symbol: string | undefined,
): GuideScanRecordDesignEligibility {
  const organism = pickOrganism(
    inferOrganismFromAssembly(record.externalSource?.assembly),
    inferOrganismFromTaxonOrSpecies(record),
  )
  if (!organism) {
    return {
      eligible: false,
      reason: GUIDESCAN_RECORD_REFERENCE_UNKNOWN_REASON,
    }
  }
  return {
    eligible: true,
    queryText: entrezId,
    identity: { kind: 'entrez_gene', entrezId, symbol },
    organism,
    label: symbol
      ? `${symbol} (Entrez ${entrezId}, ${guidescanOrganismMeta(organism)?.label ?? organism})`
      : `Entrez Gene ${entrezId} (${guidescanOrganismMeta(organism)?.label ?? organism})`,
  }
}

/**
 * Whether an opened sequence has enough *external gene identity* for GuideScan gene-mode design.
 * Does not infer genes from descriptions, feature names, or raw sequence text.
 * NCBI RefSeqGene records (NG_ accession or accession-less legacy saves) are
 * eligible only with an explicit `/db_xref="GeneID:…"` qualifier.
 */
export function guideScanDesignEligibilityForRecord(
  record: SequenceRecord,
): GuideScanRecordDesignEligibility {
  const source = record.externalSource
  const sourceAccession = source?.accession?.trim()

  if (sourceAccession && source) {
    const ensemblId = ensemblGeneFromAccession(sourceAccession)
    if (ensemblId && (source.provider === 'ensembl' || ENSEMBL_GENE_ID.test(sourceAccession))) {
      const symbol = record.name.trim()
      if (!symbol || /^ENS([A-Z]{0,4})G\d+/i.test(symbol)) {
        return {
          eligible: false,
          reason: 'Ensembl gene record is missing a gene symbol needed for GuideScan query-text.',
        }
      }
      const organism = pickOrganism(
        inferOrganismFromAssembly(source.assembly),
        inferOrganismFromEnsemblId(ensemblId),
        inferOrganismFromTaxonOrSpecies(record),
      )
      if (!organism) {
        return {
          eligible: false,
          reason: GUIDESCAN_RECORD_REFERENCE_UNKNOWN_REASON,
        }
      }
      return {
        eligible: true,
        queryText: symbol,
        identity: { kind: 'ensembl_gene', ensemblId, symbol },
        organism,
        label: `${symbol} (${ensemblId}, ${guidescanOrganismMeta(organism)?.label ?? organism})`,
      }
    }

    const entrezId = entrezGeneFromExternalSource(record)
    if (entrezId) {
      const symbol = record.name.trim() && !isLikelyEntrezGeneId(record.name) ? record.name.trim() : undefined
      return eligibleEntrezResult(record, entrezId, symbol)
    }

    const refSeqGene = entrezGeneFromRefSeqGeneRecord(record)
    if (refSeqGene) {
      return eligibleEntrezResult(record, refSeqGene.entrezId, refSeqGene.symbol)
    }

    if (isNcbiRefSeqGeneAccession(sourceAccession, source)) {
      return {
        eligible: false,
        reason: 'Opened NCBI RefSeqGene record has no unique primary /gene + GeneID match for GuideScan.',
      }
    }

    return {
      eligible: false,
      reason: 'Opened sequence lacks an Ensembl gene ID or Entrez Gene ID on externalSource.',
    }
  }

  const refSeqGene = entrezGeneFromRefSeqGeneRecord(record)
  if (refSeqGene) {
    return eligibleEntrezResult(record, refSeqGene.entrezId, refSeqGene.symbol)
  }

  if (refSeqGeneAccessionForRecord(record)) {
    return {
      eligible: false,
      reason: 'Opened NCBI RefSeqGene record has no unique primary /gene + GeneID match for GuideScan.',
    }
  }

  return {
    eligible: false,
    reason: 'Opened sequence has no external database accession for gene identity.',
  }
}
