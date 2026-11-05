import type { ExternalSequenceProvider, MoleculeType, SequenceRecord } from '../types'

export type SequenceSearchQuery = {
  term: string
  molecule: 'all' | 'nucleotide' | 'protein'
  organism?: string
  page?: number
  pageSize?: number
  onProgress?: (message: string) => void
}

export type EnsemblSequenceType = 'genomic' | 'cdna' | 'cds' | 'protein'

export type SequenceSearchResult = {
  provider: ExternalSequenceProvider
  id: string
  accession: string
  name: string
  description: string
  organism?: string
  molecule: MoleculeType
  length?: number
  reviewed?: boolean
  version?: string
  database?: string
  assembly?: string
  objectType?: string
  availableSequenceTypes?: EnsemblSequenceType[]
  relevanceRank?: number
  sourceGeneId?: string
  sourceGeneSymbol?: string
  sourceGeneMatch?: 'symbol' | 'alias' | 'related'
  sourceGeneQuery?: string
  /** Zero-based, half-open interval on `accession`, oriented as the gene is transcribed. */
  sequenceRange?: { start: number; end: number; strand: 'forward' | 'reverse' }
}

export type SequenceSearchPage = {
  results: SequenceSearchResult[]
  total: number
  page: number
  pageSize: number
}

export type ImportOptions = {
  sequenceType?: EnsemblSequenceType
  includeAnnotations?: boolean
  onProgress?: (message: string) => void
}

export type SequenceProvider = {
  id: ExternalSequenceProvider
  label: string
  search(query: SequenceSearchQuery, signal?: AbortSignal): Promise<SequenceSearchPage>
  fetch(result: SequenceSearchResult, options?: ImportOptions, signal?: AbortSignal): Promise<SequenceRecord>
}
