import type { Primer3ThalModule } from './primer3-thal.mjs'
import type { Primer3ThalInput, Primer3ThalMode, Primer3ThalResult } from '../../domain/primer3/thalProtocol'

export type { Primer3ThalInput, Primer3ThalMode, Primer3ThalResult } from '../../domain/primer3/thalProtocol'

const MODE: Record<Primer3ThalMode, number> = { any: 1, end1: 2, end2: 3 }
let instancePromise: Promise<Primer3ThalModule> | undefined
async function getInstance() {
  instancePromise ??= import('./primer3-thal.mjs').then(({ default: createModule }) => createModule())
  return instancePromise
}

function encode(module: Primer3ThalModule, value: string): number {
  const size = module.lengthBytesUTF8(value) + 1
  const pointer = module._malloc(size)
  module.stringToUTF8(value, pointer, size)
  return pointer
}

export async function primer3ThalAlign(input: Primer3ThalInput): Promise<Primer3ThalResult> {
  if (!/^[ACGTN]+$/i.test(input.sequence1) || !/^[ACGTN]+$/i.test(input.sequence2)) {
    throw new Error('Sequences must contain only A, C, G, T, or N')
  }
  if (input.sequence1.length > 10000 || input.sequence2.length > 10000 ||
      (input.sequence1.length > 60 && input.sequence2.length > 60)) {
    throw new Error('Primer3 thal supports at most 10,000 nt per sequence and not two sequences over 60 nt')
  }
  const module = await getInstance()
  const mode = input.mode ?? 'any'
  const seq1 = encode(module, input.sequence1.toUpperCase())
  const seq2 = encode(module, input.sequence2.toUpperCase())
  try {
    const chemistry = input.chemistry ?? {}
    const resultPointer = module._primer3_thal_align(
      seq1, seq2, MODE[mode], chemistry.mvMmol ?? 50, chemistry.dvMmol ?? 0,
      chemistry.dntpMmol ?? 0.8, chemistry.dnaNmol ?? 50,
      input.structureTempC ?? 37, input.maxLoop ?? 30,
    )
    if (!resultPointer) throw new Error('Primer3 thal could not allocate its result')
    try {
      const result = JSON.parse(module.UTF8ToString(resultPointer)) as Primer3ThalResult | { error: string }
      if ('error' in result) throw new Error(result.error)
      return result
    } finally { module._primer3_thal_free(resultPointer) }
  } finally { module._free(seq1); module._free(seq2) }
}
