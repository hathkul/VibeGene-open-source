import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CrossTabMessage, SharedFragment } from '../../crossTab/types'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { CloningWorkspaceEnzymeSet } from '../../cloningWorkspaceTypes'
import { postCrossTabMessage } from '../../crossTab/channel'

export type OpenTabSessionLifecyclePorts = {
  refreshOtherOpenTabs: () => void | Promise<void>
  subscribeCrossTabMessages: (listener: (message: CrossTabMessage) => void) => () => void
  upsertOpenTab: (tabId: string, record: SequenceRecord, traceFiles: TraceFileRecord[], enzymeSet?: CloningWorkspaceEnzymeSet) => void | Promise<void>
  getSharedFragment: (fragmentId: string) => Promise<SharedFragment | null>
  onSharedFragment: (fragment: SharedFragment) => void
}

export type OpenTabSessionLifecycleInput = OpenTabSessionLifecyclePorts & {
  tabId: string
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  recordRef: { current: SequenceRecord }
  traceFilesRef: { current: TraceFileRecord[] }
  enzymeSet?: CloningWorkspaceEnzymeSet
}

/** Cross-tab open-tab refresh/subscription and debounced open-tab persistence. */
export function useOpenTabSessionLifecycle(input: OpenTabSessionLifecycleInput) {
  const {
    tabId,
    record,
    traceFiles,
    recordRef,
    traceFilesRef,
    refreshOtherOpenTabs,
    ...restPorts
  } = input
  const portsRef = useRef(restPorts)
  const enzymeSetRef = useRef(input.enzymeSet)
  useLayoutEffect(() => {
    enzymeSetRef.current = input.enzymeSet
    portsRef.current = {
      subscribeCrossTabMessages: input.subscribeCrossTabMessages,
      upsertOpenTab: input.upsertOpenTab,
      getSharedFragment: input.getSharedFragment,
      onSharedFragment: input.onSharedFragment,
    }
  })

  useEffect(() => {
    void refreshOtherOpenTabs()
    return portsRef.current.subscribeCrossTabMessages((message) => {
      switch (message.type) {
        case 'open-tabs-changed':
          void refreshOtherOpenTabs()
          return
        case 'open-tab-snapshot-request':
          if (message.targetTabId === tabId) {
            void portsRef.current.upsertOpenTab(tabId, recordRef.current, traceFilesRef.current, enzymeSetRef.current)
          }
          return
        case 'cloning-source-request':
          if (message.targetTabId === tabId) {
            postCrossTabMessage({
              type: 'cloning-source-response', targetTabId: tabId, requestId: message.requestId,
              record: { ...recordRef.current, traceFiles: traceFilesRef.current },
              enzymeSet: enzymeSetRef.current,
            })
          }
          return
        case 'cloning-source-response':
          return
        case 'fragment-shared':
          if (message.fromTabId !== tabId) {
            void portsRef.current.getSharedFragment(message.fragmentId).then((fragment) => {
              if (fragment) portsRef.current.onSharedFragment(fragment)
            })
          }
          return
        case 'window-handoff-ready':
        case 'window-handoff-ack':
          return
        default: {
          const _unhandled: never = message
          return _unhandled
        }
      }
    })
  }, [refreshOtherOpenTabs, tabId, recordRef, traceFilesRef])

  const enzymeSetSignature = input.enzymeSet
    ? `${input.enzymeSet.set}\0${input.enzymeSet.supplierSetId ?? ''}\0${input.enzymeSet.selectedNames.join('\0')}`
    : ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void portsRef.current.upsertOpenTab(tabId, recordRef.current, traceFilesRef.current, enzymeSetRef.current)
    }, 1000)
    const interval = window.setInterval(() => {
      void portsRef.current.upsertOpenTab(tabId, recordRef.current, traceFilesRef.current, enzymeSetRef.current)
    }, 5000)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [enzymeSetSignature, record, tabId, traceFiles, recordRef, traceFilesRef])
}
