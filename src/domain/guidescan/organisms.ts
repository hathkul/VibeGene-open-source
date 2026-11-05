import type { GuideScanEnzyme } from './types'

export const GUIDESCAN_DEFAULT_TOP_N = 20
export const GUIDESCAN_PRODUCTION_API_BASE = 'https://guidescan.com/backend'
/** Dev-server proxy path (see `vite.config.ts`). */
export const GUIDESCAN_DEV_PROXY_BASE = '/guidescan-api'

export const GUIDESCAN_ENZYMES: readonly GuideScanEnzyme[] = ['cas9', 'cpf1']

export type GuideScanOrganismMeta = {
  id: string
  label: string
  /** Ensembl REST species slug used for gene autocomplete / sequence import. */
  ensemblSpecies: string | null
  taxonId: string | null
}

/**
 * Reference genomes advertised by GuideScan2 (`/backend/info/supported`).
 * Ensembl species is null when Ensembl does not host a matching primary assembly mapping
 * we can reliably use for symbol lookup (caller still may query GuideScan by coordinates).
 */
export const GUIDESCAN_ORGANISMS: readonly GuideScanOrganismMeta[] = [
  { id: 'hg38', label: 'Human (hg38)', ensemblSpecies: 'homo_sapiens', taxonId: '9606' },
  { id: 'hg38_no_alt', label: 'Human (hg38, no alt)', ensemblSpecies: 'homo_sapiens', taxonId: '9606' },
  { id: 't2t_chm13', label: 'Human (T2T-CHM13)', ensemblSpecies: 'homo_sapiens', taxonId: '9606' },
  { id: 'mm39', label: 'Mouse (mm39)', ensemblSpecies: 'mus_musculus', taxonId: '10090' },
  { id: 'mm10', label: 'Mouse (mm10)', ensemblSpecies: 'mus_musculus', taxonId: '10090' },
  { id: 'mm10_no_alt', label: 'Mouse (mm10, no alt)', ensemblSpecies: 'mus_musculus', taxonId: '10090' },
  { id: 'rn6', label: 'Rat (rn6)', ensemblSpecies: 'rattus_norvegicus', taxonId: '10116' },
  { id: 'dm6', label: 'Fruit fly (dm6)', ensemblSpecies: 'drosophila_melanogaster', taxonId: '7227' },
  { id: 'ce11', label: 'C. elegans (ce11)', ensemblSpecies: 'caenorhabditis_elegans', taxonId: '6239' },
  { id: 'sacCer3', label: 'Yeast (sacCer3)', ensemblSpecies: 'saccharomyces_cerevisiae', taxonId: '4932' },
]

export function isGuideScanEnzyme(value: string): value is GuideScanEnzyme {
  return (GUIDESCAN_ENZYMES as readonly string[]).includes(value)
}

export function guidescanOrganismMeta(organism: string): GuideScanOrganismMeta | undefined {
  return GUIDESCAN_ORGANISMS.find((entry) => entry.id === organism)
}

export function ensemblSpeciesForGuideScanOrganism(organism: string): string | null {
  return guidescanOrganismMeta(organism)?.ensemblSpecies ?? null
}

export function enzymePamInfo(enzyme: string): { pam: string; pamSide: '3prime' | '5prime'; spacerLength: number } {
  if (enzyme === 'cpf1') return { pam: 'TTTN', pamSide: '5prime', spacerLength: 20 }
  return { pam: 'NGG', pamSide: '3prime', spacerLength: 20 }
}

export function guidescanApiBase(override?: string): string {
  if (override?.trim()) return override.replace(/\/$/, '')
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env
  const fromEnv = typeof env?.VITE_GUIDESCAN_API_BASE === 'string' ? env.VITE_GUIDESCAN_API_BASE.trim() : ''
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (env?.DEV) return GUIDESCAN_DEV_PROXY_BASE
  return GUIDESCAN_PRODUCTION_API_BASE
}
