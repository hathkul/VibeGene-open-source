import type { SequenceRecord } from '../../domain/types'

export type ImportSourceTab = {
  tabId: string
  name: string
  molecule: SequenceRecord['molecule']
}

/** Freeze source ordering for one dialog invocation; heartbeat updates must not reshuffle it. */
export function snapshotImportSourceTabs(tabs: readonly ImportSourceTab[]): ImportSourceTab[] {
  return [...tabs]
    .sort((left, right) => left.name.localeCompare(right.name) || left.tabId.localeCompare(right.tabId))
    .map((tab) => ({ ...tab }))
}
