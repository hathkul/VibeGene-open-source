import { useCallback } from 'react'
import { extractRange, featureBounds } from '../../domain/sequence'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import { hydrateLibraryTracesFromDocument } from '../../domain/libraryMemberFeatures'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

type OpenTab = { tabId: string; stale?: boolean }

type SharedTabOptions = {
  tabId: string
  record: SequenceRecord
  selectedRange: { start: number; end: number } | null
  cutStrandSelection: unknown
  otherOpenTabs: OpenTab[]
  requestDocumentExit: (action: () => void | Promise<void>) => void
  shareFragment: (fragment: { fromTabId: string; fromRecordId: string; fromRecordName: string; sequence: string; rangeStart: number; rangeEnd: number }) => Promise<void>
  getOpenTabSession: (tabId: string) => Promise<{ record: SequenceRecord } | null>
  removeOpenTab: (tabId: string) => Promise<void>
  removeOpenTabs: (tabIds: string[]) => Promise<void>
  clearOtherOpenTabs: (tabId: string) => Promise<number>
  refreshOtherOpenTabs: () => Promise<void>
  setRecord: (record: SequenceRecord) => void
  setActiveTabMap: () => void
  setTraceFiles: (recordId: string, traces: TraceFileRecord[]) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: { start: number; end: number } | null) => void
  setLastAlignedSequence: (sequence: string) => void
  setTracesNeedRealign: (value: boolean) => void
  applyDefaultMapViewForTopology: (topology: SequenceRecord['topology'], length: number) => void
  markClean: (record: SequenceRecord, traces: TraceFileRecord[]) => void
  setStatus: (status: string) => void
}

/** Owns shared-tab fragment exchange and loading/unloading of open documents. */
export function useSharedTabController(options: SharedTabOptions) {
  const shareSelectionToOtherTabs = useCallback(async () => {
    if (!options.selectedRange || options.cutStrandSelection || options.selectedRange.start === options.selectedRange.end) {
      options.setStatus('Select a sequence range before sharing to other tabs.')
      return
    }
    const sequence = extractRange(options.record.sequence, options.selectedRange.start, options.selectedRange.end)
    await options.shareFragment({
      fromTabId: options.tabId,
      fromRecordId: options.record.id,
      fromRecordName: options.record.name,
      sequence,
      rangeStart: options.selectedRange.start,
      rangeEnd: options.selectedRange.end,
    })
    options.setStatus(`Shared ${sequence.length} bp from ${options.record.name} to other open tabs.`)
  }, [options])

  const loadFromOpenTab = useCallback((openTabId: string) => {
    options.requestDocumentExit(async () => {
      const session = await options.getOpenTabSession(openTabId)
      if (!session) {
        options.setStatus('That construct is no longer open in another tab.')
        void options.refreshOtherOpenTabs()
        return
      }
      const normalized = normalizeSequenceRecord(session.record)
      const loadedTraces = hydrateLibraryTracesFromDocument(normalized, normalized.traceFiles ?? [])
      const firstFeature = normalized.features[0]
      options.setLastAlignedSequence(normalized.sequence)
      options.setTracesNeedRealign(false)
      options.setRecord(normalized)
      options.applyDefaultMapViewForTopology(normalized.topology, normalized.sequence.length)
      options.setTraceFiles(normalized.id, loadedTraces)
      options.setSelectedFeatureId(firstFeature?.id ?? null)
      options.setSelectedPrimerId(null)
      options.setSelectionFocus(firstFeature ? 'feature' : 'dna')
      options.setSelectedRange(firstFeature ? featureBounds(firstFeature) : null)
      options.setActiveTabMap()
      options.markClean(normalized, loadedTraces)
      options.setStatus(`Loaded ${normalized.name} from another open tab.`)
    })
  }, [options])

  const unloadOpenTab = useCallback(async (openTabId: string) => {
    await options.removeOpenTab(openTabId)
    await options.refreshOtherOpenTabs()
    options.setStatus('Unloaded construct from the shared tab cache.')
  }, [options])

  const unloadOrphanedOpenTabs = useCallback(async () => {
    const orphanIds = options.otherOpenTabs.filter((tab) => tab.stale).map((tab) => tab.tabId)
    let removed: number
    if (orphanIds.length > 0) await options.removeOpenTabs(orphanIds)
    if (orphanIds.length > 0) removed = orphanIds.length
    else removed = await options.clearOtherOpenTabs(options.tabId)
    await options.refreshOtherOpenTabs()
    options.setStatus(removed === 0 ? 'No orphaned tab entries to unload.' : `Unloaded ${removed} orphaned tab ${removed === 1 ? 'entry' : 'entries'} from the shared cache.`)
  }, [options])

  return { shareSelectionToOtherTabs, loadFromOpenTab, unloadOpenTab, unloadOrphanedOpenTabs }
}
