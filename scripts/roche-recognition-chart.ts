/**
 * Recognition sequences for Roche restriction enzyme products.
 * Notation follows NEB style; cut positions are for the Roche enzyme, not isoschizomers.
 * Sources: REBASE enzyme.dat, Roche SuRE/Cut documentation, cross-check with NEB where applicable.
 */
export const rocheRecognitionChart = [
  ['Asp700I', 'GDGCH/C'],
  ['Asp718I', 'CTGCA/G'],
  ['AspEI', 'ATGCA/T'],
  ['AspI', 'GACN/NNGTC'],
  ['AviII', 'TGC/GCA'],
  ['BbrPI', 'CAC/GTG'],
  ['BfrI', 'C/TTAAG'],
  ['BlnI', 'C/CTAGG'],
  ['BmyI', 'GDGCH/C'],
  ['BpuAI', 'GAAGAC(2/6)'],
  ['BseAI', 'T/CCGGA'],
  ['BspLU11I', 'A/CATGT'],
  ['CelII', 'GC/TNAGC'],
  ['CfoI', 'G/CGC'],
  ['DraII', 'RG/GNCCY'],
  ['EclXI', 'C/CWWGG'],
  ['ItaI', 'GC/NGC'],
  ['Ksp632I', 'CTCTTC(1/4)'],
  ['KspI', 'CCGC/GG'],
  ['MaeI', 'C/TAG'],
  ['MaeII', 'ACGT/'],
  ['MaeIII', 'GTNAC/'],
  ['MamI', 'GATNN/NNATC'],
  ['MluNI', 'TGG/CCA'],
  ['MroI', 'T/CCGGA'],
  ['MvnI', 'CG/CG'],
  ['NdeII', '/GATC'],
  ['PinAI', 'A/CCGGT'],
  ['RcaI', 'T/CATGA'],
  ['SfuI', 'TT/CGAA'],
  ['SspBI', 'T/GTACA'],
  ['XmaCI', 'C/CCGGG'],
] as const

const rocheNotationByName = new Map<string, string>(
  rocheRecognitionChart.map(([name, notation]) => [name, notation]),
)

export function rocheNotationFor(enzymeName: string) {
  return rocheNotationByName.get(enzymeName) ?? null
}
