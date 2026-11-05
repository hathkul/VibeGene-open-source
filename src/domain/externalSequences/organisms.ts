import type { ExternalSequenceProvider } from '../types'

export type CommonOrganism = {
  scientificName: string
  commonName: string
  taxonId: string
  ensemblName: string
}

export const commonOrganisms: CommonOrganism[] = [
  { scientificName: 'Homo sapiens', commonName: 'Human', taxonId: '9606', ensemblName: 'homo_sapiens' },
  { scientificName: 'Mus musculus', commonName: 'Mouse', taxonId: '10090', ensemblName: 'mus_musculus' },
  { scientificName: 'Rattus norvegicus', commonName: 'Rat', taxonId: '10116', ensemblName: 'rattus_norvegicus' },
  { scientificName: 'Danio rerio', commonName: 'Zebrafish', taxonId: '7955', ensemblName: 'danio_rerio' },
  { scientificName: 'Drosophila melanogaster', commonName: 'Fruit fly', taxonId: '7227', ensemblName: 'drosophila_melanogaster' },
  { scientificName: 'Caenorhabditis elegans', commonName: 'Roundworm', taxonId: '6239', ensemblName: 'caenorhabditis_elegans' },
  { scientificName: 'Saccharomyces cerevisiae', commonName: "Baker's yeast", taxonId: '4932', ensemblName: 'saccharomyces_cerevisiae' },
  { scientificName: 'Arabidopsis thaliana', commonName: 'Thale cress', taxonId: '3702', ensemblName: 'arabidopsis_thaliana' },
  { scientificName: 'Escherichia coli', commonName: 'E. coli', taxonId: '562', ensemblName: 'escherichia_coli' },
  { scientificName: 'Cricetulus griseus', commonName: 'Chinese hamster', taxonId: '10029', ensemblName: 'cricetulus_griseus' },
]

export function organismQueryValue(provider: ExternalSequenceProvider, value: string) {
  const trimmed = value.trim()
  if (!trimmed || provider !== 'ensembl') return trimmed
  const known = commonOrganisms.find((organism) => (
    organism.taxonId === trimmed
    || organism.scientificName.toLowerCase() === trimmed.toLowerCase()
    || organism.ensemblName === trimmed.toLowerCase()
  ))
  return known?.ensemblName ?? trimmed.toLowerCase().replace(/\s+/g, '_')
}
