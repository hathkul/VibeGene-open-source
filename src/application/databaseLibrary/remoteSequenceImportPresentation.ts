import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import type { SequenceRecord } from '../../domain/types'

export function remoteSequenceProviderDisplayName(provider?: string): string {
  if (!provider) return 'database'
  if (provider === 'ncbi') return 'NCBI'
  if (provider === 'uniprot') return 'UniProt'
  if (provider === 'ensembl') return 'Ensembl'
  return provider
}

export function remoteSequenceImportStatusMessage(
  imported: SequenceRecord,
  accession: string,
  providerName: string,
): string {
  const featureCount = imported.features.length
  return `Imported ${accession} from ${providerName} (${formatSequenceLength(imported.sequence.length, imported.molecule)}, ${featureCount} feature${featureCount === 1 ? '' : 's'}).`
}
