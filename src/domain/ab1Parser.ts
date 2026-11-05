import { parseAbifChromatogram, readAb1ArrayBuffer } from './abifReader'
import { defaultConstructProperties, normalizeSequenceRecord } from './constructProperties'
import { defaultDnaEnds } from './dnaEnds'
import { createId, normalizeDna, nowIso } from './sequence'
import type { SequenceRecord } from './types'
import type { TraceFileRecord } from './traceTypes'

function emptyTraceRecord(id: string, fileName: string, parseError: string): TraceFileRecord {
  return {
    id,
    fileName,
    sequence: '',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    parseError,
  }
}

/** ABIF / AB1 files begin with the ASCII magic `ABIF`. */
export function isAb1Bytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x41 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x49 &&
    bytes[3] === 0x46
  )
}

export async function parseAb1File(file: File): Promise<TraceFileRecord> {
  const id = createId('trace')
  try {
    const bytes = await readAb1ArrayBuffer(file)
    const chromatogram = parseAbifChromatogram(bytes)
    if (!chromatogram) {
      return emptyTraceRecord(id, file.name, 'No chromatogram data found in ab1 file')
    }
    const sequence = normalizeDna(chromatogram.baseCalls.join(''))
    if (!sequence.length) {
      return emptyTraceRecord(id, file.name, 'No base calls found in ab1 file')
    }
    return {
      id,
      fileName: file.name,
      fileLastModified: file.lastModified,
      sequence,
      chromatogram,
      enabled: true,
      expanded: false,
      showAnnotations: false,
      alignment: null,
    }
  } catch (error) {
    return emptyTraceRecord(
      id,
      file.name,
      error instanceof Error ? error.message : 'Failed to parse ab1 file',
    )
  }
}

export async function parseAb1Files(files: FileList | File[]): Promise<TraceFileRecord[]> {
  const list = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.ab1'))
  return Promise.all(list.map((file) => parseAb1File(file)))
}

/**
 * Open an AB1 chromatogram as a linear DNA construct (base calls only).
 * Does not attach the chromatogram as an alignment — File → Open treats it as a sequence document.
 */
export function parseAb1BytesToSequenceRecord(
  bytes: ArrayBuffer | Uint8Array,
  fileName = 'Imported sequence.ab1',
): SequenceRecord {
  const buffer =
    bytes instanceof ArrayBuffer
      ? bytes
      : (() => {
          const copy = new Uint8Array(bytes.byteLength)
          copy.set(bytes)
          return copy.buffer
        })()
  const chromatogram = parseAbifChromatogram(buffer)
  if (!chromatogram) {
    throw new Error('No chromatogram data found in ab1 file')
  }
  const sequence = normalizeDna(chromatogram.baseCalls.join(''))
  if (!sequence.length) {
    throw new Error('No base calls found in ab1 file')
  }
  const timestamp = nowIso()
  const name = fileName.replace(/\.ab1$/i, '') || 'Untitled sequence'
  return normalizeSequenceRecord({
    id: createId('seq'),
    name,
    description: `Imported from AB1 chromatogram ${fileName}`,
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: { ...defaultConstructProperties, syntheticDna: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}
