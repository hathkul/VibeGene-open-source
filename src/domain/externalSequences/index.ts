import type { ExternalSequenceProvider } from '../types'
import { ensemblProvider } from './ensembl'
import { ncbiProvider } from './ncbi'
import type { SequenceProvider } from './types'
import { uniprotProvider } from './uniprot'

export const sequenceProviders: Record<ExternalSequenceProvider, SequenceProvider> = {
  ncbi: ncbiProvider,
  uniprot: uniprotProvider,
  ensembl: ensemblProvider,
}

export * from './types'
