import type { SequenceRecord } from '../domain/types'
import type { CloningWorkspaceEnzymeSet } from '../cloningWorkspaceTypes'

export type CrossTabMessage =
  | { type: 'open-tabs-changed' }
  | { type: 'open-tab-snapshot-request'; targetTabId: string }
  | { type: 'cloning-source-request'; targetTabId: string; requestId: string }
  | { type: 'cloning-source-response'; targetTabId: string; requestId: string; record: SequenceRecord; enzymeSet?: CloningWorkspaceEnzymeSet }
  | { type: 'fragment-shared'; fromTabId: string; fromRecordName: string; fragmentId: string }
  | { type: 'window-handoff-ready'; key: string }
  | { type: 'window-handoff-ack'; key: string }

export type OpenTabSession = {
  tabId: string
  recordId: string
  name: string
  updatedAt: string
  record: SequenceRecord
  /** Active enzyme-set selection in the owning window, when available. */
  enzymeSet?: CloningWorkspaceEnzymeSet
}

export type SharedFragment = {
  id: string
  fromTabId: string
  fromRecordId: string
  fromRecordName: string
  sequence: string
  rangeStart: number
  rangeEnd: number
  sharedAt: string
}

export type { RichClipboardFragment } from '../domain/richClipboard'

export type OpenTabSummary = {
  tabId: string
  recordId: string
  name: string
  updatedAt: string
  sequenceLength: number
  molecule: SequenceRecord['molecule']
  /** True when the tab has not heartbeated recently — likely closed without cleanup. */
  stale?: boolean
}
