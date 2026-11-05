import { defaultConstructProperties, normalizeSequenceRecord } from '../constructProperties'
import { addOperation, createId, nowIso } from '../sequence'
import type { MoleculeType, SequenceFeature, SequenceRecord } from '../types'
import { fetchJson, type FetchSequenceResourceOptions } from './http'
import { organismQueryValue } from './organisms'
import type { EnsemblSequenceType, SequenceProvider, SequenceSearchPage, SequenceSearchQuery, SequenceSearchResult } from './types'

const ENSEMBL_BASE = 'https://rest.ensembl.org'

type EnsemblExon = {
  id?: string
  start?: number
  end?: number
  strand?: number
}

type EnsemblTranslation = {
  id?: string
  start?: number
  end?: number
  length?: number
}

export type EnsemblLookup = {
  id?: string
  display_name?: string
  description?: string
  object_type?: string
  biotype?: string
  species?: string
  assembly_name?: string
  seq_region_name?: string
  start?: number
  end?: number
  strand?: number
  canonical_transcript?: string
  Parent?: string
  Exon?: EnsemblExon[]
  Transcript?: EnsemblLookup[]
  Translation?: EnsemblTranslation
}

type EnsemblXref = { id?: string; display_id?: string; description?: string; type?: string }
type EnsemblSequenceResponse = { id?: string; seq?: string; desc?: string; molecule?: string }

function sequenceTypesForLookup(lookup: EnsemblLookup): EnsemblSequenceType[] {
  const type = lookup.object_type?.toLowerCase()
  if (type === 'translation') return ['protein']
  if (type === 'transcript') {
    return lookup.biotype === 'protein_coding' || lookup.Translation ? ['cdna', 'cds', 'protein', 'genomic'] : ['cdna', 'genomic']
  }
  if (type === 'gene') return ['genomic', 'cdna', 'cds', 'protein']
  return ['genomic']
}

function moleculeForType(type: EnsemblSequenceType): MoleculeType {
  // Ensembl's cDNA endpoint returns a DNA-alphabet transcript sequence (T, not U).
  return type === 'protein' ? 'protein' : 'dna'
}

function resultFromLookup(lookup: EnsemblLookup, fallbackId: string): SequenceSearchResult {
  const id = lookup.id || fallbackId
  const availableSequenceTypes = sequenceTypesForLookup(lookup)
  return {
    provider: 'ensembl',
    id,
    accession: id,
    name: lookup.display_name || id,
    description: lookup.description || [lookup.object_type, lookup.biotype].filter(Boolean).join(' · '),
    organism: lookup.species,
    molecule: availableSequenceTypes[0] === 'protein' ? 'protein' : 'dna',
    length: lookup.start != null && lookup.end != null ? Math.abs(lookup.end - lookup.start) + 1 : undefined,
    database: 'Ensembl',
    assembly: lookup.assembly_name,
    objectType: lookup.object_type,
    availableSequenceTypes,
  }
}

async function lookupId(
  id: string,
  signal?: AbortSignal,
  expand = true,
  fetchOptions?: FetchSequenceResourceOptions,
) {
  const params = new URLSearchParams({ 'content-type': 'application/json' })
  if (expand) params.set('expand', '1')
  return fetchJson<EnsemblLookup>(
    `${ENSEMBL_BASE}/lookup/id/${encodeURIComponent(id)}?${params}`,
    { signal },
    fetchOptions,
  )
}

export async function lookupEnsemblId(id: string, signal?: AbortSignal, expand = true) {
  return lookupId(id, signal, expand)
}

export async function searchEnsembl(
  query: SequenceSearchQuery,
  signal?: AbortSignal,
  fetchOptions?: FetchSequenceResourceOptions,
): Promise<SequenceSearchPage> {
  const pageSize = Math.max(1, Math.min(50, query.pageSize ?? 20))
  const page = Math.max(0, query.page ?? 0)
  const term = query.term.trim()
  query.onProgress?.(`Looking up "${term}" in Ensembl…`)
  if (/^ENS[A-Z0-9]*\d+(?:\.\d+)?$/i.test(term)) {
    const lookup = await lookupId(term, signal, true, fetchOptions)
    const result = resultFromLookup(lookup, term)
    const allowed = query.molecule === 'all'
      || (query.molecule === 'protein' && result.availableSequenceTypes?.includes('protein'))
      || (query.molecule === 'nucleotide' && result.availableSequenceTypes?.some((type) => type !== 'protein'))
    return { results: allowed ? [result] : [], total: allowed ? 1 : 0, page, pageSize }
  }

  const species = organismQueryValue('ensembl', query.organism ?? '') || 'homo_sapiens'
  query.onProgress?.(`Resolving "${term}" as a gene symbol in Ensembl (${species.replace(/_/g, ' ')})…`)
  const xrefs = await fetchJson<EnsemblXref[]>(
    `${ENSEMBL_BASE}/xrefs/symbol/${encodeURIComponent(species)}/${encodeURIComponent(term)}?object_type=gene`,
    { signal },
    fetchOptions,
  )
  const ids = [...new Set(xrefs.map((xref) => xref.id).filter((id): id is string => Boolean(id)))].slice(0, pageSize)
  if (ids.length) {
    query.onProgress?.(`Fetching Ensembl metadata for ${ids.length} match${ids.length === 1 ? '' : 'es'}…`)
  }
  const lookups = await Promise.all(ids.map(async (id) => {
    try {
      return await lookupId(id, signal, false, fetchOptions)
    } catch {
      return { id } satisfies EnsemblLookup
    }
  }))
  const results = lookups.map((lookup, index) => resultFromLookup(lookup, ids[index]!))
  return { results, total: results.length, page, pageSize }
}

function chooseLookupObject(root: EnsemblLookup, requestedId: string, sequenceType: EnsemblSequenceType) {
  if (root.object_type?.toLowerCase() !== 'gene' || sequenceType === 'genomic') return root
  const transcripts = root.Transcript ?? []
  const canonical = root.canonical_transcript?.replace(/\.\d+$/, '')
  return transcripts.find((transcript) => transcript.id?.replace(/\.\d+$/, '') === canonical)
    || transcripts.find((transcript) => sequenceType !== 'protein' || transcript.Translation)
    || transcripts[0]
    || { ...root, id: requestedId }
}

function genomicRange(root: EnsemblLookup, start: number, end: number) {
  const rootStart = Number(root.start ?? 1)
  const rootEnd = Number(root.end ?? rootStart)
  return root.strand === -1
    ? { start: Math.max(0, rootEnd - end), end: Math.max(0, rootEnd - start + 1) }
    : { start: Math.max(0, start - rootStart), end: Math.max(0, end - rootStart + 1) }
}

function ensemblFeatures(
  lookup: EnsemblLookup,
  sequenceType: EnsemblSequenceType,
  sequenceLength: number,
): SequenceFeature[] {
  if (sequenceType === 'protein') return []
  if (sequenceType === 'cds') {
    return sequenceLength ? [{
      id: createId('feature'),
      name: lookup.Translation?.id || 'CDS',
      type: 'CDS',
      color: '#f59e0b',
      locations: [{ start: 0, end: sequenceLength, strand: 'forward' }],
    }] : []
  }
  const transcripts = lookup.object_type?.toLowerCase() === 'gene' ? lookup.Transcript ?? [] : [lookup]
  const features: SequenceFeature[] = []
  if (sequenceType === 'genomic') {
    for (const transcript of transcripts) {
      if (transcript.start == null || transcript.end == null) continue
      const range = genomicRange(lookup, transcript.start, transcript.end)
      features.push({
        id: createId('feature'),
        name: transcript.display_name || transcript.id || 'transcript',
        type: 'mRNA',
        color: '#10b981',
        notes: transcript.biotype ? `/note="${transcript.biotype}"` : undefined,
        locations: [{ ...range, strand: 'forward' }],
      })
      for (const exon of transcript.Exon ?? []) {
        if (exon.start == null || exon.end == null) continue
        const exonRange = genomicRange(lookup, exon.start, exon.end)
        features.push({
          id: createId('feature'),
          name: exon.id || 'exon',
          type: 'exon',
          color: '#84cc16',
          locations: [{ ...exonRange, strand: 'forward' }],
        })
      }
    }
    return features.filter((feature) => feature.locations[0]!.end <= sequenceLength)
  }

  let cursor = 0
  const exons = [...(lookup.Exon ?? [])].sort((left, right) => lookup.strand === -1
    ? Number(right.start ?? 0) - Number(left.start ?? 0)
    : Number(left.start ?? 0) - Number(right.start ?? 0))
  for (const exon of exons) {
    const length = Math.max(0, Number(exon.end ?? 0) - Number(exon.start ?? 0) + 1)
    if (!length) continue
    features.push({
      id: createId('feature'),
      name: exon.id || 'exon',
      type: 'exon',
      color: '#84cc16',
      locations: [{ start: cursor, end: Math.min(sequenceLength, cursor + length), strand: 'forward' }],
    })
    cursor += length
  }
  return features.filter((feature) => feature.locations[0]!.end > feature.locations[0]!.start)
}

export async function fetchEnsemblRecord(
  result: SequenceSearchResult,
  options?: { sequenceType?: EnsemblSequenceType; includeAnnotations?: boolean; onProgress?: (message: string) => void },
  signal?: AbortSignal,
): Promise<SequenceRecord> {
  options?.onProgress?.('Fetching Ensembl annotations…')
  const root = await lookupId(result.accession, signal)
  const requestedType = options?.sequenceType
    || (root.object_type?.toLowerCase() === 'translation' ? 'protein' : 'genomic')
  const target = chooseLookupObject(root, result.accession, requestedType)
  let targetId = target.id || result.accession
  if (requestedType === 'protein' && target.Translation?.id) targetId = target.Translation.id
  const params = new URLSearchParams({ type: requestedType, 'content-type': 'application/json' })
  options?.onProgress?.(`Downloading ${requestedType} sequence for ${targetId} from Ensembl…`)
  const payload = await fetchJson<EnsemblSequenceResponse>(
    `${ENSEMBL_BASE}/sequence/id/${encodeURIComponent(targetId)}?${params}`,
    { signal },
  )
  const sequence = payload.seq?.replace(/\s/g, '').toUpperCase() ?? ''
  if (!sequence) throw new Error('Ensembl returned an empty sequence for this object and molecule type.')
  const retrievedAt = nowIso()
  const molecule = moleculeForType(requestedType)
  const accession = targetId
  const features = options?.includeAnnotations === false ? [] : ensemblFeatures(
    requestedType === 'genomic' ? root : target,
    requestedType,
    sequence.length,
  )
  const record: SequenceRecord = {
    id: createId('seq'),
    name: target.display_name || root.display_name || accession,
    description: target.description || root.description || payload.desc || '',
    molecule,
    topology: 'linear',
    sequence,
    externalSource: {
      provider: 'ensembl',
      accession,
      retrievedAt,
      database: 'Ensembl',
      assembly: target.assembly_name || root.assembly_name,
      sourceUrl: `https://www.ensembl.org/id/${encodeURIComponent(accession)}`,
    },
    protein: molecule === 'protein' ? {
      numberingStart: 1,
      numberingRegions: [],
      bonds: [],
      sourceDatabase: 'Ensembl',
      sourceAccession: accession,
      retrievedAt,
    } : undefined,
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
  return normalizeSequenceRecord(addOperation(record, 'databaseImport', `Imported ${accession} from Ensembl as ${requestedType}.`))
}

export const ensemblProvider: SequenceProvider = {
  id: 'ensembl',
  label: 'Ensembl',
  search: searchEnsembl,
  fetch: fetchEnsemblRecord,
}
