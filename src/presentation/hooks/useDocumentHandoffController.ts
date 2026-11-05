import { useCallback } from 'react'
import type { SequenceRecord } from '../../domain/types'
import { createId } from '../../domain/sequence'
import { NEW_WORKSPACE_DOCUMENT_ORIGIN, type WorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'

export type OpenRecordOptions = {
  activate?: boolean
  folderId?: string | null | undefined
  initiallyUnsaved?: boolean
  projectId?: string
  diskPath?: string
  /** Preserve the original save target when opening a derived workspace. */
  documentOrigin?: WorkspaceDocumentOrigin
  /** Open the destination workspace's Save to Database chooser after handoff. */
  openSaveToDatabase?: boolean
  onOpenResult?: (opened: boolean) => void
  suppressFailureStatus?: boolean
  /** Browser tab opened during a user gesture for an asynchronously prepared record. */
  reservedTab?: Window
}

type DocumentHandoffOptions = {
  libraryFolderId: string | null | undefined
  isNativeDesktop: () => boolean
  storeHandoffRecord: (record: SequenceRecord, folderId: string | null | undefined, origin?: WorkspaceDocumentOrigin) => Promise<string | null>
  openNativeHandoff: (key: string, options: { title: string; focus: boolean; initiallyUnsaved: boolean; projectId?: string; openSaveToDatabase?: boolean }) => Promise<boolean>
  focusExistingDocument: (target: { projectId?: string; diskPath?: string }) => Promise<boolean>
  restoreNativeFocus: (active: boolean) => void
  openBrowserHandoff: (key: string, record: SequenceRecord, folderId: string | null | undefined, options: { title: string; activate: boolean; initiallyUnsaved: boolean; suppressFailureStatus?: boolean; documentOrigin?: WorkspaceDocumentOrigin; openSaveToDatabase?: boolean; reservedTab?: Window }) => boolean
  setStatus: (status: string) => void
  setBlockedBatchOpen: (value: { products: SequenceRecord[]; openedCount: number }) => void
}

/** Coordinates opening records in new workspaces and browser tabs through handoff ports. */
export function useDocumentHandoffController(options: DocumentHandoffOptions) {
  const openRecordInNewTab = useCallback((source: SequenceRecord, openOptions?: OpenRecordOptions) => {
    const activate = openOptions?.activate !== false
    const title = source.name?.trim() || 'VibeGene'
    const folderId = openOptions && 'folderId' in openOptions ? openOptions.folderId : options.libraryFolderId
    const initiallyUnsaved = openOptions?.initiallyUnsaved === true
    const projectId = openOptions?.projectId
    const diskPath = openOptions?.diskPath
    const documentOrigin = openOptions?.documentOrigin
      ?? (initiallyUnsaved ? NEW_WORKSPACE_DOCUMENT_ORIGIN : undefined)
    if (options.isNativeDesktop()) {
      void (async () => {
        try {
          if (projectId || diskPath) {
            const focused = await options.focusExistingDocument({ projectId, diskPath })
            if (focused) {
              openOptions?.onOpenResult?.(true)
              return
            }
          }
          const key = await options.storeHandoffRecord(source, folderId, documentOrigin)
          if (!key) {
            if (!openOptions?.suppressFailureStatus) options.setStatus('Could not open the construct in a new window.')
            openOptions?.onOpenResult?.(false)
            return
          }
          const opened = await options.openNativeHandoff(key, {
            title,
            focus: activate,
            initiallyUnsaved,
            projectId,
            openSaveToDatabase: openOptions?.openSaveToDatabase,
          })
          if (!opened) {
            if (!openOptions?.suppressFailureStatus) options.setStatus('Could not open the construct in a new window.')
            openOptions?.onOpenResult?.(false)
            return
          }
          options.restoreNativeFocus(activate)
          openOptions?.onOpenResult?.(true)
        } catch (error) {
          if (!openOptions?.suppressFailureStatus) options.setStatus(`Could not open a new window: ${error instanceof Error ? error.message : String(error)}`)
          openOptions?.onOpenResult?.(false)
        }
      })()
      return
    }
    const key = createId('hist')
    const opened = options.openBrowserHandoff(key, source, folderId, { title, activate, initiallyUnsaved, suppressFailureStatus: openOptions?.suppressFailureStatus, documentOrigin, openSaveToDatabase: openOptions?.openSaveToDatabase, reservedTab: openOptions?.reservedTab })
    if (!opened) {
      if (!openOptions?.suppressFailureStatus) options.setStatus('Could not open a new tab (popup blocked). Allow popups for this site and try again.')
      openOptions?.onOpenResult?.(false)
      return
    }
    openOptions?.onOpenResult?.(true)
  }, [options])

  const openUnsavedRecordsInNewTabs = useCallback((sources: SequenceRecord[]) => {
    if (sources.length === 0) return
    if (options.isNativeDesktop()) {
      sources.forEach((source, index) => openRecordInNewTab(source, { activate: index === sources.length - 1, initiallyUnsaved: true }))
      return
    }
    if (sources.length === 1) {
      openRecordInNewTab(sources[0]!, { initiallyUnsaved: true })
      return
    }
    let settled = 0
    let openedCount = 0
    const blockedIndexes = new Set<number>()
    sources.forEach((source, index) => {
      openRecordInNewTab(source, {
        activate: index === sources.length - 1,
        initiallyUnsaved: true,
        suppressFailureStatus: true,
        onOpenResult: (opened) => {
          settled += 1
          if (opened) openedCount += 1
          else blockedIndexes.add(index)
          if (settled !== sources.length) return
          const blockedProducts = sources.filter((_, sourceIndex) => blockedIndexes.has(sourceIndex))
          if (blockedProducts.length) {
            options.setBlockedBatchOpen({ products: blockedProducts, openedCount })
            options.setStatus(`${sources.length} products created; ${openedCount} opened and ${blockedProducts.length} blocked by the browser.`)
          } else {
            options.setStatus(`Opened all ${openedCount} products in new tabs.`)
          }
        },
      })
    })
  }, [options, openRecordInNewTab])

  return { openRecordInNewTab, openUnsavedRecordsInNewTabs }
}
