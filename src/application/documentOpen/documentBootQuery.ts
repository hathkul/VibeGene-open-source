import { REMOTE_SEQUENCE_QUERY_PARAM } from '../../domain/remoteSequenceFile'

/** Query params cleared after a disk / remote boot open succeeds. */
export const DOCUMENT_BOOT_FILE_QUERY_PARAM_NAMES = [
  'fileHandoff',
  'openPath',
  REMOTE_SEQUENCE_QUERY_PARAM,
] as const

/** Query params stripped after a successful history handoff mount. */
export const DOCUMENT_BOOT_HISTORY_QUERY_PARAM_NAMES = ['history', 'unsaved', 'saveToDatabase'] as const

export type DocumentBootQuery = {
  historyKey: string | null
  fileHandoffKey: string | null
  openPath: string | null
  initiallyUnsaved: boolean
  openSaveToDatabase: boolean
}

export function parseDocumentBootQuery(search: string): DocumentBootQuery {
  try {
    const params = new URLSearchParams(search)
    return {
      historyKey: params.get('history'),
      fileHandoffKey: params.get('fileHandoff'),
      openPath: params.get('openPath'),
      initiallyUnsaved: params.get('unsaved') === '1',
      openSaveToDatabase: params.get('saveToDatabase') === '1',
    }
  } catch {
    return {
      historyKey: null,
      fileHandoffKey: null,
      openPath: null,
      initiallyUnsaved: false,
      openSaveToDatabase: false,
    }
  }
}

export function resolvePendingIdbHandoffKey(
  historyKey: string | null,
  compactHandoffRecord: unknown | null,
): string | null {
  if (compactHandoffRecord) return null
  return historyKey
}

export function shouldSkipAsyncDocumentBootstrap(openedFromHandoff: boolean): boolean {
  return openedFromHandoff
}

export function shouldClearFileBootQueryParams(input: {
  openedFromHandoff: boolean
  workspaceDiskPath: string | null
}): boolean {
  return input.openedFromHandoff && Boolean(input.workspaceDiskPath)
}

export function stripDocumentBootQueryParams(
  href: string,
  paramNames: readonly string[],
): string | null {
  try {
    const url = new URL(href)
    for (const name of paramNames) url.searchParams.delete(name)
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}
