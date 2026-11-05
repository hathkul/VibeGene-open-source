import { isAb1Bytes, parseAb1BytesToSequenceRecord } from './ab1Parser'
import { hydrateLibraryTracesFromDocument } from './libraryMemberFeatures'
import { isDnaLibraryRecord } from './dnaLibrary'
import {
  isSnapGeneBytes,
  parseProjectJson,
  parseSequenceBytes,
  parseSnapGene,
  rejectedSequenceDocumentReason,
} from './parsers'
import { parseSnapGeneTracesAsync } from './snapgeneTraces'
import { normalizeSequenceRecord } from './constructProperties'
import { addOperation } from './sequence'
import { importRequiresTopologyChoice } from './sequenceTopology'
import { isSettingsFile } from './settingsFile'
import type { SequenceRecord } from './types'
import type { TraceFileRecord } from './traceTypes'

/**
 * Copy a typed-array view into a standalone ArrayBuffer.
 * `Uint8Array.buffer` may be a SharedArrayBuffer or a larger backing store with a nonzero offset.
 */
export function ownedArrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const { buffer } = copy
  if (buffer instanceof ArrayBuffer && copy.byteOffset === 0 && buffer.byteLength === copy.byteLength) {
    return buffer
  }
  const owned = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(owned).set(bytes)
  return owned
}

export type OpenedDesktopSequence = {
  record: SequenceRecord
  traces: TraceFileRecord[]
  fileName: string
  path: string | null
}

/**
 * Parse construct bytes for a desktop file open (startup drop, Open With, recent file).
 * Used before React mounts so the editor never paints the demo plasmid first.
 */
export async function openDesktopSequenceBytes(
  bytes: Uint8Array,
  fileName: string,
  path: string | null = null,
): Promise<OpenedDesktopSequence> {
  const rejected = rejectedSequenceDocumentReason(bytes)
  if (rejected) throw new Error(rejected)

  if (isSnapGeneBytes(bytes)) {
    const parsed = parseSnapGene(bytes, fileName, { skipTraces: true })
    const traces = await parseSnapGeneTracesAsync(bytes, parsed.sequence, parsed.topology, parsed)
    const imported = addOperation(parsed, 'import', `Imported ${fileName}.`)
    const hydrated = isDnaLibraryRecord(imported)
      ? hydrateLibraryTracesFromDocument(imported, traces)
      : traces
    return {
      record: imported,
      traces: hydrated,
      fileName,
      path,
    }
  }

  if (isAb1Bytes(bytes) || /\.ab1$/i.test(fileName)) {
    const parsed = parseAb1BytesToSequenceRecord(bytes, fileName)
    return {
      record: addOperation(parsed, 'import', `Imported ${fileName}.`),
      traces: [],
      fileName,
      path,
    }
  }

  const text = new TextDecoder().decode(bytes)
  if (text.trim().startsWith('{') && /\.json$/i.test(fileName)) {
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON')
    }
    if (isSettingsFile(parsedJson)) {
      throw new Error('Settings files cannot open as a construct window')
    }
    const project = parseProjectJson(text)
    const imported = addOperation(project.record, 'import', `Imported ${fileName}.`)
    const traces = hydrateLibraryTracesFromDocument(imported, imported.traceFiles ?? [])
    return { record: imported, traces, fileName, path }
  }

  let parsed = parseSequenceBytes(ownedArrayBufferFromBytes(bytes), fileName)
  if (parsed.molecule !== 'protein' && importRequiresTopologyChoice(text, fileName)) {
    // Boot path has no dialog yet — keep circular default used elsewhere for silent opens.
    parsed = normalizeSequenceRecord({ ...parsed, topology: 'circular' })
  }
  return {
    record: addOperation(parsed, 'import', `Imported ${fileName}.`),
    traces: [],
    fileName,
    path,
  }
}
