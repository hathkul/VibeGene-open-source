import { isAb1Bytes } from '../../domain/ab1Parser'
import { isTraceDocumentFileName } from '../../domain/traceDocumentFile'

export type LocalDocumentFile = {
  bytes: Uint8Array
  fileName: string
  path: string | null
}

export type LocalDocumentOpenRequest = {
  handoffKey: string | null
  directPath: string | null
}

export type LocalDocumentOpenPorts<TSequence, TTrace> = {
  takeHandoff: (key: string) => Promise<LocalDocumentFile | null>
  readPath: (path: string) => Promise<LocalDocumentFile | null>
  openSequence: (file: LocalDocumentFile) => Promise<TSequence>
  openTrace: (file: LocalDocumentFile) => Promise<TTrace>
  reportHandoffError?: (error: unknown) => void
}

export type OpenedLocalDocument<TSequence, TTrace> =
  | { kind: 'sequence'; opened: TSequence }
  | { kind: 'trace'; opened: TTrace }

/**
 * Resolve a one-shot handoff before falling back to the direct desktop path,
 * then route the bytes through the appropriate parser port.
 */
export async function openLocalDocument<TSequence, TTrace>(
  request: LocalDocumentOpenRequest,
  ports: LocalDocumentOpenPorts<TSequence, TTrace>,
): Promise<OpenedLocalDocument<TSequence, TTrace> | null> {
  const { handoffKey, directPath } = request
  if (!handoffKey && !directPath) return null

  let file: LocalDocumentFile | null = null
  if (handoffKey) {
    try {
      file = await ports.takeHandoff(handoffKey)
      if (file && !file.path) file = { ...file, path: directPath }
    } catch (error) {
      ports.reportHandoffError?.(error)
    }
  }
  if (!file && directPath) file = await ports.readPath(directPath)
  if (!file) return null

  if (isAb1Bytes(file.bytes) || isTraceDocumentFileName(file.fileName)) {
    return { kind: 'trace', opened: await ports.openTrace(file) }
  }
  return { kind: 'sequence', opened: await ports.openSequence(file) }
}
