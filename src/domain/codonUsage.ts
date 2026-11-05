export type CodonUsageOrganism = 'mammals' | 'eColi' | 'yeast' | 'insects'

export type CodonUsagePercent = Record<CodonUsageOrganism, number>

/** Relative synonymous codon usage (%) for common hosts (primer insertion picker). */
export const codonUsagePercent: Record<string, CodonUsagePercent> = {
  TTT: { mammals: 46, eColi: 58, yeast: 59, insects: 56 },
  TTC: { mammals: 54, eColi: 42, yeast: 41, insects: 44 },
  TTA: { mammals: 8, eColi: 14, yeast: 28, insects: 7 },
  TTG: { mammals: 13, eColi: 13, yeast: 29, insects: 14 },
  CTT: { mammals: 13, eColi: 12, yeast: 13, insects: 8 },
  CTC: { mammals: 20, eColi: 10, yeast: 6, insects: 18 },
  CTA: { mammals: 7, eColi: 4, yeast: 14, insects: 9 },
  CTG: { mammals: 40, eColi: 47, yeast: 11, insects: 44 },
  ATT: { mammals: 36, eColi: 49, yeast: 46, insects: 33 },
  ATC: { mammals: 48, eColi: 39, yeast: 26, insects: 47 },
  ATA: { mammals: 16, eColi: 12, yeast: 28, insects: 20 },
  ATG: { mammals: 100, eColi: 100, yeast: 100, insects: 100 },
  GTT: { mammals: 18, eColi: 28, yeast: 39, insects: 24 },
  GTC: { mammals: 24, eColi: 20, yeast: 21, insects: 23 },
  GTA: { mammals: 12, eColi: 17, yeast: 21, insects: 15 },
  GTG: { mammals: 46, eColi: 35, yeast: 19, insects: 38 },
  TCT: { mammals: 18, eColi: 17, yeast: 26, insects: 16 },
  TCC: { mammals: 22, eColi: 15, yeast: 16, insects: 21 },
  TCA: { mammals: 15, eColi: 14, yeast: 21, insects: 14 },
  TCG: { mammals: 6, eColi: 14, yeast: 10, insects: 9 },
  AGT: { mammals: 15, eColi: 15, yeast: 16, insects: 15 },
  AGC: { mammals: 24, eColi: 25, yeast: 11, insects: 25 },
  CCT: { mammals: 28, eColi: 18, yeast: 31, insects: 22 },
  CCC: { mammals: 33, eColi: 13, yeast: 15, insects: 31 },
  CCA: { mammals: 27, eColi: 20, yeast: 41, insects: 26 },
  CCG: { mammals: 11, eColi: 49, yeast: 12, insects: 21 },
  ACT: { mammals: 25, eColi: 19, yeast: 35, insects: 23 },
  ACC: { mammals: 36, eColi: 40, yeast: 22, insects: 38 },
  ACA: { mammals: 28, eColi: 17, yeast: 30, insects: 21 },
  ACG: { mammals: 11, eColi: 25, yeast: 13, insects: 18 },
  GCT: { mammals: 27, eColi: 18, yeast: 38, insects: 23 },
  GCC: { mammals: 40, eColi: 26, yeast: 22, insects: 32 },
  GCA: { mammals: 23, eColi: 23, yeast: 29, insects: 25 },
  GCG: { mammals: 11, eColi: 33, yeast: 11, insects: 20 },
  TAT: { mammals: 44, eColi: 59, yeast: 56, insects: 45 },
  TAC: { mammals: 56, eColi: 41, yeast: 44, insects: 55 },
  TAA: { mammals: 28, eColi: 61, yeast: 48, insects: 35 },
  TAG: { mammals: 20, eColi: 9, yeast: 23, insects: 21 },
  TGA: { mammals: 52, eColi: 30, yeast: 29, insects: 44 },
  CAT: { mammals: 42, eColi: 57, yeast: 64, insects: 43 },
  CAC: { mammals: 58, eColi: 43, yeast: 36, insects: 57 },
  CAA: { mammals: 27, eColi: 34, yeast: 69, insects: 32 },
  CAG: { mammals: 73, eColi: 66, yeast: 31, insects: 68 },
  AAT: { mammals: 46, eColi: 47, yeast: 59, insects: 45 },
  AAC: { mammals: 54, eColi: 53, yeast: 41, insects: 55 },
  AAA: { mammals: 42, eColi: 76, yeast: 58, insects: 40 },
  AAG: { mammals: 58, eColi: 24, yeast: 42, insects: 60 },
  GAT: { mammals: 46, eColi: 65, yeast: 65, insects: 50 },
  GAC: { mammals: 54, eColi: 35, yeast: 35, insects: 50 },
  GAA: { mammals: 42, eColi: 68, yeast: 70, insects: 46 },
  GAG: { mammals: 58, eColi: 32, yeast: 30, insects: 54 },
  TGT: { mammals: 46, eColi: 46, yeast: 63, insects: 45 },
  TGC: { mammals: 54, eColi: 54, yeast: 37, insects: 55 },
  TGG: { mammals: 100, eColi: 100, yeast: 100, insects: 100 },
  CGT: { mammals: 8, eColi: 36, yeast: 15, insects: 12 },
  CGC: { mammals: 18, eColi: 36, yeast: 6, insects: 20 },
  CGA: { mammals: 11, eColi: 7, yeast: 7, insects: 10 },
  CGG: { mammals: 20, eColi: 11, yeast: 4, insects: 17 },
  AGA: { mammals: 21, eColi: 7, yeast: 48, insects: 18 },
  AGG: { mammals: 21, eColi: 4, yeast: 21, insects: 23 },
  GGT: { mammals: 16, eColi: 35, yeast: 47, insects: 26 },
  GGC: { mammals: 34, eColi: 37, yeast: 19, insects: 34 },
  GGA: { mammals: 25, eColi: 13, yeast: 22, insects: 24 },
  GGG: { mammals: 25, eColi: 15, yeast: 12, insects: 16 },
}

export const codonUsageOrganismOptions: { id: CodonUsageOrganism; label: string }[] = [
  { id: 'mammals', label: 'Mammals' },
  { id: 'eColi', label: 'E. coli' },
  { id: 'yeast', label: 'Yeast' },
  { id: 'insects', label: 'Insects' },
]

export function codonFrequencyForOrganism(codon: string, organism: CodonUsageOrganism): number | null {
  const usage = codonUsagePercent[codon.toUpperCase()]
  if (!usage) return null
  return usage[organism]
}

export function codonFrequencyLabel(codon: string): string {
  const usage = codonUsagePercent[codon.toUpperCase()]
  if (!usage) return codon
  return `${codon} (mammals ${usage.mammals}%, E. coli ${usage.eColi}%, yeast ${usage.yeast}%, insects ${usage.insects}%)`
}
