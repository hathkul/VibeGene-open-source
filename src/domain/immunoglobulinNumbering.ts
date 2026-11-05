import initImmunumWasm from 'immunum/immunum_bg.wasm?init'

// This adapter targets immunum 1.2.0's wasm-bindgen ABI, so the package is pinned.

export type ImmunoglobulinNumberingScheme = 'imgt' | 'kabat'
export type ImmunoglobulinChainSelection = 'auto' | 'H' | 'VHH' | 'light' | 'K' | 'L'

export type VhhHallmarkEvidence = {
  kabatPosition: 37 | 44 | 45 | 47
  schemePosition: number
  residue: string | null
  expected: string
  matches: boolean
  sequenceIndex: number | null
}

export type VhhClassification = {
  subtype: 'VH' | 'VHH'
  /** Sequence-based VHH evidence from 0 to 1; this is not a species assignment. */
  confidence: number
  mode: 'detected' | 'manual'
  hallmarkMatches: number
  hallmarks: VhhHallmarkEvidence[]
  cdr3Length: number
  /** Predicted extra CDR1–CDR3 cysteine pair, when it is unambiguous. */
  extraCysteinePair: [number, number] | null
}

export type ImmunoglobulinNumbering = {
  scheme: ImmunoglobulinNumberingScheme
  chain: 'H' | 'K' | 'L'
  confidence: number
  queryStart: number
  queryEnd: number
  /** Numbering label for each reference residue; null outside the detected V-domain. */
  positions: Array<string | null>
  /** Heavy-chain subtype evidence. Undefined for kappa and lambda chains. */
  vhh?: VhhClassification
}

const vhhHallmarks = [
  { kabatPosition: 37 as const, imgtPosition: 42, expected: 'F/Y', matches: (residue: string) => residue === 'F' || residue === 'Y', weight: 0.15 },
  { kabatPosition: 44 as const, imgtPosition: 49, expected: 'E/Q', matches: (residue: string) => residue === 'E' || residue === 'Q', weight: 0.25 },
  { kabatPosition: 45 as const, imgtPosition: 50, expected: 'R', matches: (residue: string) => residue === 'R', weight: 0.25 },
  { kabatPosition: 47 as const, imgtPosition: 52, expected: 'G', matches: (residue: string) => residue === 'G', weight: 0.25 },
]

function numericPosition(label: string | null) {
  const match = label ? /^(\d+)/.exec(label) : null
  return match ? Number.parseInt(match[1], 10) : null
}

function indicesInNumberingRange(positions: Array<string | null>, start: number, end: number) {
  return positions.flatMap((label, index) => {
    const position = numericPosition(label)
    return position !== null && position >= start && position <= end ? [index] : []
  })
}

function classifyHeavySubtype(
  sequence: string,
  scheme: ImmunoglobulinNumberingScheme,
  positions: Array<string | null>,
  forceVhh: boolean,
): VhhClassification {
  const hallmarks = vhhHallmarks.map((definition): VhhHallmarkEvidence => {
    const schemePosition = scheme === 'imgt' ? definition.imgtPosition : definition.kabatPosition
    const sequenceIndex = positions.findIndex((label) => label === String(schemePosition))
    const residue = sequenceIndex >= 0 ? sequence[sequenceIndex] ?? null : null
    return {
      kabatPosition: definition.kabatPosition,
      schemePosition,
      residue,
      expected: definition.expected,
      matches: residue !== null && definition.matches(residue),
      sequenceIndex: sequenceIndex >= 0 ? sequenceIndex : null,
    }
  })
  const hallmarkMatches = hallmarks.filter((hallmark) => hallmark.matches).length
  const hallmarkScore = vhhHallmarks.reduce(
    (score, definition, index) => score + (hallmarks[index].matches ? definition.weight : 0),
    0,
  )
  const [cdr1Start, cdr1End] = scheme === 'imgt' ? [27, 38] : [31, 35]
  const [cdr3Start, cdr3End] = scheme === 'imgt' ? [105, 117] : [95, 102]
  const cdr1Indices = indicesInNumberingRange(positions, cdr1Start, cdr1End)
  const cdr3Indices = indicesInNumberingRange(positions, cdr3Start, cdr3End)
  const cdr1Cysteines = cdr1Indices.filter((index) => sequence[index] === 'C')
  const cdr3Cysteines = cdr3Indices.filter((index) => sequence[index] === 'C')
  const extraCysteinePair: [number, number] | null = cdr1Cysteines.length === 1 && cdr3Cysteines.length === 1
    ? [cdr1Cysteines[0], cdr3Cysteines[0]]
    : null
  const cdr3Length = cdr3Indices.length
  const cdr3Score = cdr3Length >= 18 ? 0.1 : cdr3Length >= 14 ? 0.05 : 0
  const confidence = Math.min(1, hallmarkScore + cdr3Score + (extraCysteinePair ? 0.05 : 0))
  const detectedVhh = hallmarkMatches >= 2 && confidence >= 0.55

  return {
    subtype: forceVhh || detectedVhh ? 'VHH' : 'VH',
    confidence,
    mode: forceVhh ? 'manual' : 'detected',
    hallmarkMatches,
    hallmarks,
    cdr3Length,
    extraCysteinePair,
  }
}

type ImmunumNumberingResult = {
  chain: string | null
  scheme: string | null
  confidence: number | null
  numbering: Map<string, string> | null
  query_start: number | null
  query_end: number | null
  error: string | null
}

type ImmunumWasmExports = {
  memory: WebAssembly.Memory
  annotator_new: (chainsPointer: number, chainsLength: number, schemePointer: number, schemeLength: number, minConfidence: number) => [number, number, number]
  annotator_number: (annotatorPointer: number, sequencePointer: number, sequenceLength: number) => ImmunumNumberingResult
  __wbg_annotator_free: (annotatorPointer: number, fromFinalizer: number) => void
  __wbindgen_malloc: (size: number, alignment: number) => number
  __wbindgen_realloc: (pointer: number, oldSize: number, newSize: number, alignment: number) => number
  __wbindgen_exn_store: (index: number) => void
  __externref_table_alloc: () => number
  __wbindgen_externrefs: WebAssembly.Table
  __externref_table_dealloc: (index: number) => void
  __wbindgen_start: () => void
}

let wasm: ImmunumWasmExports
let wasmPromise: Promise<ImmunumWasmExports> | null = null
let cachedDataView: DataView | null = null
let cachedBytes: Uint8Array | null = null
let encodedLength = 0

const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
const encoder = new TextEncoder()

function dataView() {
  if (!cachedDataView || cachedDataView.buffer !== wasm.memory.buffer) {
    cachedDataView = new DataView(wasm.memory.buffer)
  }
  return cachedDataView
}

function bytes() {
  if (!cachedBytes || cachedBytes.buffer !== wasm.memory.buffer) {
    cachedBytes = new Uint8Array(wasm.memory.buffer)
  }
  return cachedBytes
}

function stringFromWasm(pointer: number, length: number) {
  return decoder.decode(bytes().subarray(pointer >>> 0, (pointer >>> 0) + length))
}

function passStringToWasm(value: string) {
  let length = value.length
  let pointer = wasm.__wbindgen_malloc(length, 1) >>> 0
  const memory = bytes()
  let offset = 0
  for (; offset < length; offset += 1) {
    const code = value.charCodeAt(offset)
    if (code > 0x7f) break
    memory[pointer + offset] = code
  }
  if (offset !== length) {
    const suffix = offset ? value.slice(offset) : value
    pointer = wasm.__wbindgen_realloc(pointer, length, length = offset + suffix.length * 3, 1) >>> 0
    const target = bytes().subarray(pointer + offset, pointer + length)
    const result = encoder.encodeInto(suffix, target)
    offset += result.written
    pointer = wasm.__wbindgen_realloc(pointer, length, offset, 1) >>> 0
  }
  encodedLength = offset
  return pointer
}

function addExternref(value: unknown) {
  const index = wasm.__externref_table_alloc()
  wasm.__wbindgen_externrefs.set(index, value)
  return index
}

function takeExternref(index: number) {
  const value = wasm.__wbindgen_externrefs.get(index)
  wasm.__externref_table_dealloc(index)
  return value
}

function passStringArrayToWasm(values: string[]) {
  const pointer = wasm.__wbindgen_malloc(values.length * 4, 4) >>> 0
  values.forEach((value, index) => dataView().setUint32(pointer + index * 4, addExternref(value), true))
  encodedLength = values.length
  return pointer
}

function debugString(value: unknown) {
  if (typeof value === 'string') return `"${value}"`
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`
  try {
    return typeof value === 'object' ? `Object(${JSON.stringify(value)})` : String(value)
  } catch {
    return String(value)
  }
}

function handleImportError(callback: () => unknown) {
  try {
    return callback()
  } catch (error) {
    wasm.__wbindgen_exn_store(addExternref(error))
    return false
  }
}

function immunumImports(): WebAssembly.Imports {
  return {
    './immunum_bg.js': {
      __wbg_set_bf7251625df30a02: (target: Map<unknown, unknown>, key: unknown, value: unknown) => target.set(key, value),
      __wbg_new_ab79df5bd7c26067: () => ({}),
      __wbg_new_49d5571bd3f0c4d4: () => new Map(),
      __wbg_set_7eaa4f96924fd6b3: (target: object, key: PropertyKey, value: unknown) =>
        handleImportError(() => Reflect.set(target, key, value)),
      __wbg___wbindgen_throw_6ddd609b62940d55: (pointer: number, length: number) => {
        throw new Error(stringFromWasm(pointer, length))
      },
      __wbg___wbindgen_string_get_395e606bd0ee4427: (outputPointer: number, value: unknown) => {
        const text = typeof value === 'string' ? value : undefined
        const pointer = text === undefined ? 0 : passStringToWasm(text)
        const length = encodedLength
        dataView().setInt32(outputPointer + 4, length, true)
        dataView().setInt32(outputPointer, pointer, true)
      },
      __wbg___wbindgen_debug_string_5398f5bb970e0daa: (outputPointer: number, value: unknown) => {
        const pointer = passStringToWasm(debugString(value))
        const length = encodedLength
        dataView().setInt32(outputPointer + 4, length, true)
        dataView().setInt32(outputPointer, pointer, true)
      },
      __wbindgen_init_externref_table: () => {
        const table = wasm.__wbindgen_externrefs
        const offset = table.grow(4)
        table.set(0, undefined)
        table.set(offset, undefined)
        table.set(offset + 1, null)
        table.set(offset + 2, true)
        table.set(offset + 3, false)
      },
      __wbindgen_cast_0000000000000001: (value: number) => value,
      __wbindgen_cast_0000000000000002: (pointer: number, length: number) => stringFromWasm(pointer, length),
    },
  }
}

async function loadImmunumWasm() {
  if (!wasmPromise) {
    wasmPromise = initImmunumWasm(immunumImports()).then((instance) => {
      wasm = instance.exports as unknown as ImmunumWasmExports
      wasm.__wbindgen_start()
      return wasm
    })
  }
  return wasmPromise
}

export type ImmunumChainCode = 'H' | 'K' | 'L' | 'A' | 'B' | 'G' | 'D'

export type ImmunumAlignment = {
  chain: ImmunumChainCode
  confidence: number
  queryStart: number
  queryEnd: number
  positions: Array<string | null>
}

/** Compact protein letters + stops; immunum rejects `*`, so analysis skips stop markers. */
function compactProteinWithStopMap(sequenceInput: string): {
  sequence: string
  analysisSequence: string
  analysisToOriginal: number[]
} {
  const sequence = sequenceInput.replace(/[^A-Za-z*]/g, '').toUpperCase()
  const analysisToOriginal: number[] = []
  let analysisSequence = ''
  for (let index = 0; index < sequence.length; index += 1) {
    if (sequence[index] === '*') continue
    analysisToOriginal.push(index)
    analysisSequence += sequence[index]
  }
  return { sequence, analysisSequence, analysisToOriginal }
}

/** Low-level immunum alignment shared by antibody and TCR numbering. */
export async function alignImmunumDomain(
  sequenceInput: string,
  chains: ImmunumChainCode[],
  scheme: ImmunoglobulinNumberingScheme,
  minConfidence = 0.5,
): Promise<ImmunumAlignment> {
  await loadImmunumWasm()
  const { sequence, analysisSequence, analysisToOriginal } = compactProteinWithStopMap(sequenceInput)
  if (!analysisSequence) throw new Error('The reference protein sequence is empty.')
  if (!chains.length) throw new Error('At least one immunum chain must be requested.')

  const chainsPointer = passStringArrayToWasm(chains)
  const chainsLength = encodedLength
  const schemePointer = passStringToWasm(scheme)
  const schemeLength = encodedLength
  const [annotatorPointer, errorIndex, failed] = wasm.annotator_new(
    chainsPointer,
    chainsLength,
    schemePointer,
    schemeLength,
    Math.fround(minConfidence),
  )
  if (failed) throw takeExternref(errorIndex)

  let result: ImmunumNumberingResult
  try {
    const sequencePointer = passStringToWasm(analysisSequence)
    result = wasm.annotator_number(annotatorPointer, sequencePointer, encodedLength)
  } finally {
    wasm.__wbg_annotator_free(annotatorPointer, 0)
  }

  if (result.error || !result.numbering || result.query_start === null || result.query_end === null) {
    throw new Error(result.error || 'No adaptive-immune variable domain was detected.')
  }
  if (
    result.chain !== 'H'
    && result.chain !== 'K'
    && result.chain !== 'L'
    && result.chain !== 'A'
    && result.chain !== 'B'
    && result.chain !== 'G'
    && result.chain !== 'D'
  ) {
    throw new Error(`Unsupported immunum chain type: ${result.chain ?? 'unknown'}.`)
  }

  const positions = Array<string | null>(sequence.length).fill(null)
  let analysisIndex = result.query_start
  for (const [position, residue] of result.numbering) {
    if (
      analysisIndex > result.query_end
      || analysisSequence[analysisIndex] !== residue.toUpperCase()
    ) {
      throw new Error('The detected numbering could not be mapped back to the reference sequence.')
    }
    positions[analysisToOriginal[analysisIndex]] = position
    analysisIndex += 1
  }
  if (analysisIndex !== result.query_end + 1) {
    throw new Error('The detected numbering did not cover the complete variable domain.')
  }

  return {
    chain: result.chain,
    confidence: result.confidence ?? 0,
    queryStart: analysisToOriginal[result.query_start],
    queryEnd: analysisToOriginal[result.query_end] + 1,
    positions,
  }
}

/** Detect and number an antibody V-domain locally; sequence data never leaves the app. */
export async function detectImmunoglobulinNumbering(
  sequenceInput: string,
  scheme: ImmunoglobulinNumberingScheme,
  chainSelection: ImmunoglobulinChainSelection = 'auto',
): Promise<ImmunoglobulinNumbering> {
  const sequence = sequenceInput.replace(/[^A-Za-z*]/g, '').toUpperCase()
  const chains: ImmunumChainCode[] = chainSelection === 'auto'
    ? ['H', 'K', 'L']
    : chainSelection === 'light'
      ? ['K', 'L']
      : chainSelection === 'VHH'
        ? ['H']
        : [chainSelection]
  const alignment = await alignImmunumDomain(sequence, chains, scheme)
  if (alignment.chain !== 'H' && alignment.chain !== 'K' && alignment.chain !== 'L') {
    throw new Error('The detected domain is not an antibody heavy or light chain.')
  }

  return {
    scheme,
    chain: alignment.chain,
    confidence: alignment.confidence,
    queryStart: alignment.queryStart,
    queryEnd: alignment.queryEnd,
    positions: alignment.positions,
    vhh: alignment.chain === 'H'
      ? classifyHeavySubtype(sequence, scheme, alignment.positions, chainSelection === 'VHH')
      : undefined,
  }
}
