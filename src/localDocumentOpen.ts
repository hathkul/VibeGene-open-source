import {
  openLocalDocument,
  type LocalDocumentFile,
  type LocalDocumentOpenRequest,
} from './application/documentOpen/openLocalDocument'
import { parseAb1BytesToSequenceRecord, parseAb1File } from './domain/ab1Parser'
import type { OpenedDesktopSequence } from './domain/openDesktopSequenceFile'
import type { SequenceRecord } from './domain/types'
import type { TraceFileRecord } from './domain/traceTypes'
import { bytesToFile, readDroppedDesktopPaths } from './desktop/fileIo'

export type OpenedLocalTraceDocument = {
  trace: TraceFileRecord
  record: SequenceRecord | null
  fileName: string
  path: string | null
}

async function takeLocalFileHandoff(key: string): Promise<LocalDocumentFile | null> {
  const { takeFileOpenHandoff } = await import('./storage/fileOpenHandoff')
  const handoff = await takeFileOpenHandoff(key)
  if (!handoff) return null
  return {
    bytes: handoff.bytes,
    fileName: handoff.name,
    path: handoff.path || null,
  }
}

async function readLocalDocumentPath(path: string): Promise<LocalDocumentFile | null> {
  const [file] = await readDroppedDesktopPaths([path])
  return file ? { bytes: file.bytes, fileName: file.name, path: file.path } : null
}

async function openLocalTraceDocument(file: LocalDocumentFile): Promise<OpenedLocalTraceDocument> {
  const trace = await parseAb1File(bytesToFile(file.fileName, file.bytes))
  let record: SequenceRecord | null = null
  try {
    record = parseAb1BytesToSequenceRecord(file.bytes, file.fileName)
  } catch {
    // A parse-error trace still opens in the trace viewer with a shell record.
  }
  return { trace, record, fileName: file.fileName, path: file.path }
}

/** Concrete startup composition for local handoffs and direct desktop paths. */
export function openLocalStartupDocument(
  request: LocalDocumentOpenRequest,
  reportHandoffError?: (error: unknown) => void,
) {
  return openLocalDocument<OpenedDesktopSequence, OpenedLocalTraceDocument>(request, {
    takeHandoff: takeLocalFileHandoff,
    readPath: readLocalDocumentPath,
    openSequence: async ({ bytes, fileName, path }) => {
      const { openDesktopSequenceBytes } = await import('./domain/openDesktopSequenceFile')
      return openDesktopSequenceBytes(bytes, fileName, path)
    },
    openTrace: openLocalTraceDocument,
    reportHandoffError,
  })
}
