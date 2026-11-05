import { nebRecognitionChart } from './neb-recognition-chart.ts'

export const eurxRecognitionOverrides: Record<string, string> = {
  AcvI: 'CAC/GTG',
  BsiHKCI: 'C/YCGRG',
  CviJI: 'RG/CY',
  'CviJI(*)': 'G/C',
  HpySP4III: 'ACN/GT',
  LlaDII: 'GC/NGC',
  MluILS: 'A/CGCGT',
  NotILS: 'GC/GGCCGC',
  PvuIILS: 'CAG/CTG',
  SalILS: 'G/TCGAC',
  ScaILS: 'AGT/ACT',
  TaqII: 'GACCGA(11/9)',
  TspGWI: 'ACGGA(11/9)',
  TspDTI: 'ATGAA(11/9)',
  BanII: 'GRGCY/C',
  BssHII: 'G/CGCGC',
  DraI: 'TTT/AAA',
  HincII: 'GTY/RAC',
  MspI: 'C/CGG',
  MnlI: 'CCTC(7/6)',
  MboII: 'GAAGA(8/7)',
  FokI: 'GGATG(9/13)',
  BglI: 'GCCNNNNNGGC',
  BstXI: 'CCANNNNNNTGG',
  SfiI: 'GGCCNNNNNGGCC',
}

export const eurxAlsoKnownAsOverrides: Record<string, string> = {
  AcvI: 'PmaCI',
  BsiHKCI: 'AvaI',
  MluILS: 'MluI',
  NotILS: 'NotI',
  PvuIILS: 'PvuII',
  SalILS: 'SalI',
  ScaILS: 'ScaI',
  LlaDII: 'Fnu4HI',
  HpySP4III: 'TaaI',
  PinAI: 'AgeI',
}

/** EURx SKUs superseded by ONE-buffer primary listings (reduced-star repackages). */
export const eurxDuplicateSkuNames = new Set([
  'Mlul',
  'MluI RS*',
  'NotI RS',
  'PvuII RS',
  'SalI RS',
  'ScaI RS',
  'SfiI RS',
])

const nebNotationByName = new Map<string, string>()
for (const [name, notation] of nebRecognitionChart) {
  nebNotationByName.set(name.replace(/[®§]/g, ''), notation)
}

export function eurxNotationFor(eurxName: string, alsoKnownAs: string | null = null): string | null {
  const override = eurxRecognitionOverrides[eurxName]
  if (override) return override

  const alias = alsoKnownAs ?? eurxAlsoKnownAsOverrides[eurxName] ?? null
  if (alias) {
    const fromAlias = nebNotationByName.get(alias)
    if (fromAlias) return fromAlias
  }

  for (const variant of [eurxName, `${eurxName}-HF`]) {
    const neb = nebNotationByName.get(variant)
    if (neb) return neb
  }

  return null
}
