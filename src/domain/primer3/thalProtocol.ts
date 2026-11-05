export type Primer3ThalMode = 'any' | 'end1' | 'end2'

export type Primer3ThalInput = {
  sequence1: string
  sequence2: string
  mode?: Primer3ThalMode
  /** Primer3 units: monovalent/divalent/dNTP mM, oligo concentration nM. */
  chemistry?: { mvMmol?: number; dvMmol?: number; dntpMmol?: number; dnaNmol?: number }
  /** Structure drawing reference temperature in °C; this does not set the reported Tm. */
  structureTempC?: number
  maxLoop?: number
}

export type Primer3ThalResult = {
  tmC: number
  /** 1-based sequence end indices from Primer3; -1 when unavailable. */
  alignEnd1: number
  alignEnd2: number
  structure: string
  mode: Primer3ThalMode
}

export type Primer3ThalWorkerRequest = { id: number; input: Primer3ThalInput }
export type Primer3ThalWorkerResponse =
  | { id: number; ok: true; result: Primer3ThalResult }
  | { id: number; ok: false; error: string }
