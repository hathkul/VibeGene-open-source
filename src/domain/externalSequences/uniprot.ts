import { defaultConstructProperties, normalizeSequenceRecord } from '../constructProperties'
import { PROTEIN_FEATURE_COLORS, type ProteinFeatureType } from '../proteinFeatures'
import { addOperation, createId, nowIso } from '../sequence'
import type { ProteinBond, SequenceFeature, SequenceRecord } from '../types'
import { fetchJson, fetchSequenceResource } from './http'
import type { SequenceProvider, SequenceSearchPage, SequenceSearchQuery, SequenceSearchResult } from './types'

const UNIPROT_BASE = 'https://rest.uniprot.org/uniprotkb'

type UniProtValue = { value?: string }
type UniProtPosition = { value?: number }
type UniProtFeature = {
  type?: string
  description?: string
  featureId?: string
  evidences?: Array<{ evidenceCode?: string; source?: string; id?: string }>
  location?: { start?: UniProtPosition; end?: UniProtPosition }
}

export type UniProtEntry = {
  primaryAccession?: string
  uniProtkbId?: string
  entryType?: string
  entryAudit?: { sequenceVersion?: number; entryVersion?: number }
  proteinDescription?: {
    recommendedName?: { fullName?: UniProtValue }
    submissionNames?: Array<{ fullName?: UniProtValue }>
  }
  genes?: Array<{ geneName?: UniProtValue }>
  organism?: { scientificName?: string; commonName?: string; taxonId?: number }
  sequence?: { value?: string; length?: number; version?: number }
  features?: UniProtFeature[]
  comments?: Array<{ commentType?: string; texts?: UniProtValue[] }>
}

type UniProtSearchResponse = { results?: UniProtEntry[] }

function proteinName(entry: UniProtEntry) {
  return entry.proteinDescription?.recommendedName?.fullName?.value
    || entry.proteinDescription?.submissionNames?.[0]?.fullName?.value
    || entry.genes?.[0]?.geneName?.value
    || entry.uniProtkbId
    || entry.primaryAccession
    || 'UniProt protein'
}

function resultFromEntry(entry: UniProtEntry): SequenceSearchResult | null {
  const accession = entry.primaryAccession?.trim()
  if (!accession) return null
  return {
    provider: 'uniprot',
    id: accession,
    accession,
    name: entry.genes?.[0]?.geneName?.value || entry.uniProtkbId || accession,
    description: proteinName(entry),
    organism: entry.organism?.scientificName,
    molecule: 'protein',
    length: entry.sequence?.length,
    reviewed: /reviewed/i.test(entry.entryType ?? ''),
    version: String(entry.entryAudit?.sequenceVersion ?? entry.sequence?.version ?? '') || undefined,
    database: 'UniProtKB',
  }
}

export async function searchUniProt(query: SequenceSearchQuery, signal?: AbortSignal): Promise<SequenceSearchPage> {
  const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 20))
  const page = Math.max(0, query.page ?? 0)
  if (query.molecule === 'nucleotide') return { results: [], total: 0, page, pageSize }
  const terms = [`(${query.term.trim()})`]
  if (query.organism?.trim()) {
    const organism = query.organism.trim()
    terms.push(/^\d+$/.test(organism) ? `organism_id:${organism}` : `organism_name:"${organism.replace(/"/g, '')}"`)
  }
  const params = new URLSearchParams({
    query: terms.join(' AND '),
    format: 'json',
    size: String(pageSize),
  })
  query.onProgress?.(`Querying UniProtKB for "${query.term.trim()}"…`)
  const response = await fetchSequenceResource(`${UNIPROT_BASE}/search?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  })
  const total = Number(response.headers.get('x-total-results') ?? 0)
  const payload = await response.json() as UniProtSearchResponse
  const results = (payload.results ?? []).flatMap((entry) => {
    const result = resultFromEntry(entry)
    return result ? [result] : []
  })
  return { results, total: total || results.length, page, pageSize }
}

function featureType(value: string | undefined): ProteinFeatureType {
  const type = (value ?? '').toLowerCase().replace(/[_-]/g, ' ')
  if (type.includes('signal')) return 'signal peptide'
  if (type.includes('transit')) return 'transit peptide'
  if (type.includes('transmem')) return 'transmembrane'
  if (type.includes('coiled')) return 'coiled coil'
  if (type.includes('active')) return 'active site'
  if (type.includes('metal')) return 'metal binding'
  if (type.includes('binding')) return 'binding site'
  if (type.includes('glycos')) return 'glycosylation'
  if (type.includes('lipid')) return 'lipidation'
  if (type.includes('modified') || type.includes('mod res')) return 'modified residue'
  if (type.includes('cross')) return 'cross-link'
  if (type.includes('domain')) return 'domain'
  if (type.includes('repeat')) return 'repeat'
  if (type.includes('motif')) return 'motif'
  if (type.includes('chain') || type.includes('peptide')) return 'chain'
  if (type.includes('site')) return 'site'
  if (type.includes('region')) return 'region'
  return 'other'
}

function featureNotes(feature: UniProtFeature) {
  const evidence = (feature.evidences ?? [])
    .map((item) => [item.evidenceCode, item.source && item.id ? `${item.source}:${item.id}` : item.source].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('; ')
  return [feature.description ? `/note="${feature.description.replace(/"/g, "'")}"` : '', evidence ? `/evidence="${evidence}"` : '']
    .filter(Boolean)
    .join(' ')
}

function featureRange(feature: UniProtFeature, length: number) {
  const start = Math.max(0, Math.min(length, Number(feature.location?.start?.value ?? 1) - 1))
  const end = Math.max(start, Math.min(length, Number(feature.location?.end?.value ?? start + 1)))
  return end > start ? { start, end } : null
}

function bondType(feature: UniProtFeature): ProteinBond['type'] | null {
  const value = (feature.type ?? '').toLowerCase()
  if (value.includes('disulf')) return 'disulfide'
  if (value.includes('cross')) return 'cross-link'
  return null
}

const IMPORTABLE_FEATURE_TYPES = new Set([
  'CHAIN', 'PEPTIDE', 'PROPEP', 'SIGNAL', 'TRANSIT', 'TOPO_DOM', 'TRANSMEM', 'INTRAMEM',
  'DOMAIN', 'REPEAT', 'CA_BIND', 'ZN_FING', 'DNA_BIND', 'NP_BIND', 'REGION', 'COILED',
  'MOTIF', 'COMPBIAS', 'ACT_SITE', 'BINDING', 'SITE', 'LIPID', 'CARBOHYD', 'DISULFID',
  'CROSSLNK', 'MOD_RES', 'INIT_MET',
  'PROPEPTIDE', 'SIGNAL_PEPTIDE', 'TRANSIT_PEPTIDE', 'TOPOLOGICAL_DOMAIN', 'TRANSMEMBRANE',
  'INTRAMEMBRANE', 'CALCIUM_BINDING', 'ZINC_FINGER', 'DNA_BINDING', 'NUCLEOTIDE_BINDING',
  'COILED_COIL', 'COMPOSITIONAL_BIAS', 'ACTIVE_SITE', 'BINDING_SITE', 'LIPIDATION',
  'GLYCOSYLATION', 'DISULFIDE_BOND', 'CROSS_LINK', 'MODIFIED_RESIDUE', 'INITIATOR_METHIONINE',
])

function isImportableFeature(feature: UniProtFeature) {
  const normalized = (feature.type ?? '').toUpperCase().replace(/[ -]+/g, '_')
  return IMPORTABLE_FEATURE_TYPES.has(normalized)
    || normalized.includes('DISULF')
    || normalized.includes('CROSS')
}

export function recordFromUniProtEntry(entry: UniProtEntry, includeAnnotations = true): SequenceRecord {
  const accession = entry.primaryAccession?.trim()
  const sequence = entry.sequence?.value?.replace(/\s/g, '').toUpperCase() ?? ''
  if (!accession || !sequence) throw new Error('UniProt returned a record without an accession or sequence.')
  const retrievedAt = nowIso()
  const annotatedFeatures = (entry.features ?? []).filter(isImportableFeature)
  const features: SequenceFeature[] = includeAnnotations
    ? annotatedFeatures.flatMap((feature) => {
        if (bondType(feature)) return []
        const range = featureRange(feature, sequence.length)
        if (!range) return []
        const type = featureType(feature.type)
        return [{
          id: createId('feature'),
          name: feature.description || feature.type || type,
          type,
          color: PROTEIN_FEATURE_COLORS[type],
          notes: featureNotes(feature),
          locations: [{ ...range, strand: 'forward' as const }],
        }]
      })
    : []
  const bonds: ProteinBond[] = includeAnnotations
    ? annotatedFeatures.flatMap((feature) => {
        const type = bondType(feature)
        const range = featureRange(feature, sequence.length)
        if (!type || !range || range.end - 1 <= range.start) return []
        return [{
          id: createId('bond'),
          name: feature.description || feature.type || 'Bond',
          type,
          endpoints: [{ residue: range.start }, { residue: range.end - 1 }],
          notes: featureNotes(feature),
        }]
      })
    : []
  const comments = (entry.comments ?? [])
    .filter((comment) => comment.commentType === 'FUNCTION')
    .flatMap((comment) => (comment.texts ?? []).map((text) => text.value).filter(Boolean))
    .join('\n\n')
    .slice(0, 4000)
  const sequenceVersion = entry.entryAudit?.sequenceVersion ?? entry.sequence?.version
  const record: SequenceRecord = {
    id: createId('seq'),
    name: entry.genes?.[0]?.geneName?.value || entry.uniProtkbId || accession,
    description: [proteinName(entry), entry.organism?.scientificName, comments].filter(Boolean).join('\n\n'),
    molecule: 'protein',
    topology: 'linear',
    sequence,
    externalSource: {
      provider: 'uniprot',
      accession,
      version: sequenceVersion != null ? String(sequenceVersion) : undefined,
      retrievedAt,
      database: 'UniProtKB',
      sourceUrl: `https://www.uniprot.org/uniprotkb/${encodeURIComponent(accession)}/entry`,
    },
    protein: {
      numberingStart: 1,
      numberingRegions: [],
      bonds,
      sourceDatabase: 'UniProtKB',
      sourceAccession: accession,
      retrievedAt,
    },
    features,
    primers: [],
    operations: [],
    construct: {
      ...defaultConstructProperties,
      syntheticDna: false,
      accessionNumber: accession,
    },
    createdAt: retrievedAt,
    updatedAt: retrievedAt,
  }
  return normalizeSequenceRecord(addOperation(record, 'databaseImport', `Imported ${accession} from UniProt.`))
}

export async function fetchUniProtRecord(
  result: SequenceSearchResult,
  options?: { includeAnnotations?: boolean; onProgress?: (message: string) => void },
  signal?: AbortSignal,
) {
  options?.onProgress?.(`Downloading UniProt entry ${result.accession}…`)
  const entry = await fetchJson<UniProtEntry>(`${UNIPROT_BASE}/${encodeURIComponent(result.accession)}.json`, { signal })
  return recordFromUniProtEntry(entry, options?.includeAnnotations !== false)
}

export async function fetchUniProtEntries(accessions: readonly string[], signal?: AbortSignal) {
  const unique = [...new Set(accessions.map((accession) => accession.trim()).filter(Boolean))].slice(0, 50)
  if (!unique.length) return []
  const params = new URLSearchParams({
    query: unique.map((accession) => `accession:${accession.replace(/[^A-Za-z0-9_.-]/g, '')}`).join(' OR '),
    format: 'json',
    size: String(unique.length),
  })
  const payload = await fetchJson<UniProtSearchResponse>(`${UNIPROT_BASE}/search?${params}`, { signal })
  return payload.results ?? []
}

export const uniprotProvider: SequenceProvider = {
  id: 'uniprot',
  label: 'UniProt',
  search: searchUniProt,
  fetch: fetchUniProtRecord,
}
