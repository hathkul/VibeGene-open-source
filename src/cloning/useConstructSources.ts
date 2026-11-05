import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { subscribeCrossTabMessages } from '../crossTab/channel'
import { getCloningOpenTabSession, listOtherOpenTabs, pruneStaleOpenTabs } from '../crossTab/openTabs'
import { isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from '../domain/parsers'
import type { SequenceRecord } from '../domain/types'
import type { CloningWorkspaceEnzymeSet } from '../cloningWorkspaceTypes'
import { openRecentLocalPath } from '../desktop/fileIo'
import { isTauriRuntime } from '../desktop/tauriRuntime'
import { getProject } from '../storage/projects'
import {
  RECENT_FILES_CHANGED_EVENT,
  listRecentFiles,
  type RecentFileEntry,
} from '../storage/recentFiles'
import { getSessionDraft, listSessionDrafts } from '../storage/sessionDraft'

export type ConstructSourceOption =
  | { kind: 'current'; label: string; record: SequenceRecord }
  | { kind: 'open-tab'; label: string; tabId: string; record: SequenceRecord; enzymeSet?: CloningWorkspaceEnzymeSet }
  | { kind: 'recent'; label: string; recentKey: string; record: SequenceRecord }
  | { kind: 'draft'; label: string; draftId: string; record: SequenceRecord }
  | { kind: 'database'; label: string; projectId: string; record: SequenceRecord }

export type ConstructSourceGroups = {
  current: ConstructSourceOption[]
  open: ConstructSourceOption[]
  recent: ConstructSourceOption[]
  drafts: ConstructSourceOption[]
}

export function constructSourceOptionValue(option: ConstructSourceOption): string {
  if (option.kind === 'open-tab') return `open-tab:${option.tabId}`
  if (option.kind === 'recent') return `recent:${option.recentKey}`
  if (option.kind === 'draft') return `draft:${option.draftId}`
  if (option.kind === 'database') return `database:${option.projectId}`
  return `current:${option.record.id}`
}

export function groupConstructSourceOptions(options: ConstructSourceOption[]): ConstructSourceGroups {
  return {
    current: options.filter((option) => option.kind === 'current'),
    open: options
      .filter((option) => option.kind === 'open-tab')
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }) ||
          constructSourceOptionValue(left).localeCompare(constructSourceOptionValue(right)),
      ),
    recent: options.filter((option) => option.kind === 'recent'),
    drafts: options.filter((option) => option.kind === 'draft'),
  }
}

function recentKey(entry: RecentFileEntry) {
  return entry.kind === 'database' ? `database:${entry.projectId}` : `local:${entry.path}`
}

async function loadRecentRecord(entry: RecentFileEntry): Promise<SequenceRecord | null> {
  if (entry.kind === 'database') return (await getProject(entry.projectId))?.record ?? null
  if (!isTauriRuntime()) return null
  const file = await openRecentLocalPath(entry.path)
  if (!file) return null
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  return isSnapGeneBytes(bytes)
    ? parseSnapGene(bytes, file.name)
    : parseSequenceBytes(buffer, file.name)
}

export function useConstructSources({
  active = true,
  currentRecord,
  currentTabId,
}: {
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
}) {
  const [openTabs, setOpenTabs] = useState<ConstructSourceOption[]>([])
  const [recent, setRecent] = useState<ConstructSourceOption[]>([])
  const [drafts, setDrafts] = useState<ConstructSourceOption[]>([])
  const refreshGenerationRef = useRef(0)
  const openTabCache = useRef(new Map<string, Extract<ConstructSourceOption, { kind: 'open-tab' }>>())
  const freshRefreshes = useRef(0)

  const refresh = useCallback(async (freshOpenTabs = false) => {
    if (!freshOpenTabs && freshRefreshes.current > 0) return
    if (freshOpenTabs) freshRefreshes.current += 1
    try {
      const generation = ++refreshGenerationRef.current
      await pruneStaleOpenTabs(currentTabId)
      const [tabs, recentEntries, draftSummaries] = await Promise.all([
        listOtherOpenTabs(currentTabId),
        Promise.resolve(listRecentFiles()),
        listSessionDrafts(),
      ])
      const [tabSessions, recentRecords, draftRecords] = await Promise.all([
        Promise.all(
          tabs.map(async (tab) => {
            const cached = openTabCache.current.get(tab.tabId)
            if (!freshOpenTabs && cached && cached.record.id === tab.recordId) return cached
            const session = await getCloningOpenTabSession(tab.tabId)
            if (!session) return null
            return {
              kind: 'open-tab' as const,
              label: `${session.name} (${isTauriRuntime() ? 'open window' : 'open tab'})`,
              tabId: tab.tabId,
              record: session.record,
              enzymeSet: session.enzymeSet,
            }
          }),
        ),
        Promise.all(
          recentEntries.map(async (entry) => {
            try {
              const record = await loadRecentRecord(entry)
              return record
                ? {
                    kind: 'recent' as const,
                    label: entry.name,
                    recentKey: recentKey(entry),
                    record,
                  }
                : null
            } catch {
              return null
            }
          }),
        ),
        Promise.all(
          draftSummaries.map(async (summary) => {
            const draft = await getSessionDraft(summary.id)
            return draft
              ? {
                  kind: 'draft' as const,
                  label: summary.name,
                  draftId: summary.id,
                  record: draft.record,
                }
              : null
          }),
        ),
      ])
      if (generation !== refreshGenerationRef.current) return
      const availableTabs = tabSessions.filter((option): option is NonNullable<typeof option> => Boolean(option))
      openTabCache.current = new Map(availableTabs.map(option => [option.tabId, option]))
      setOpenTabs(availableTabs)
      setRecent(recentRecords.filter((option): option is NonNullable<typeof option> => Boolean(option)))
      setDrafts(draftRecords.filter((option): option is NonNullable<typeof option> => Boolean(option)))
    } finally {
      if (freshOpenTabs) freshRefreshes.current -= 1
    }
  }, [currentTabId])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const refreshTimer = window.setTimeout(() => {
      void refresh().catch(() => {
        if (!cancelled) {
          setOpenTabs([])
          setRecent([])
          setDrafts([])
        }
      })
    }, 0)
    return () => {
      cancelled = true
      refreshGenerationRef.current += 1
      window.clearTimeout(refreshTimer)
    }
  }, [active, currentRecord.id, refresh])

  useEffect(() => {
    if (!active) return
    const handleRecentChange = () => void refresh()
    window.addEventListener(RECENT_FILES_CHANGED_EVENT, handleRecentChange)
    return () => window.removeEventListener(RECENT_FILES_CHANGED_EVENT, handleRecentChange)
  }, [active, refresh])

  useEffect(() => {
    if (!active) return
    return subscribeCrossTabMessages((message) => {
      if (message.type === 'open-tabs-changed') void refresh()
    })
  }, [active, refresh])

  const options = useMemo<ConstructSourceOption[]>(() => {
    const current: ConstructSourceOption = {
      kind: 'current',
      label: `${currentRecord.name} (this window)`,
      record: currentRecord,
    }
    const openIds = new Set<string>()
    const uniqueOpen = openTabs.filter((option) => {
      if (option.record.id === currentRecord.id || openIds.has(option.record.id)) return false
      openIds.add(option.record.id)
      return true
    })
    const recentIds = new Set<string>()
    const uniqueRecent = recent.filter((option) => {
      if (option.record.id === currentRecord.id || recentIds.has(option.record.id)) return false
      recentIds.add(option.record.id)
      return true
    })
    const draftIds = new Set<string>()
    const uniqueDrafts = drafts.filter((option) => {
      if (option.record.id === currentRecord.id || draftIds.has(option.record.id)) return false
      draftIds.add(option.record.id)
      return true
    })
    return [current, ...uniqueOpen, ...uniqueRecent, ...uniqueDrafts]
  }, [currentRecord, drafts, openTabs, recent])

  const groups = useMemo<ConstructSourceGroups>(
    () => groupConstructSourceOptions(options),
    [options],
  )

  return { groups, options, refresh }
}
