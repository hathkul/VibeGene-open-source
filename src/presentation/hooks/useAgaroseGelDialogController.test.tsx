// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { AgaroseGelDialogSnapshot } from '../../application/agaroseGel/agaroseGelDialogOpenPlan'
import type { SequenceRecord } from '../../domain/types'
import {
  useAgaroseGelDialogController,
  type AgaroseGelDialogHybridPort,
} from './useAgaroseGelDialogController'

function dnaRecord(): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'pUC19',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGTACGT',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function gelPorts(
  tryOpenAgaroseGelHybridWindow: AgaroseGelDialogHybridPort['tryOpenAgaroseGelHybridWindow'],
): AgaroseGelDialogHybridPort {
  return { tryOpenAgaroseGelHybridWindow }
}

describe('useAgaroseGelDialogController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('opens in-app gel with snapshot when hybrid window is unavailable', async () => {
    const hybridSnapshots: AgaroseGelDialogSnapshot[] = []
    let controller: ReturnType<typeof useAgaroseGelDialogController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useAgaroseGelDialogController(
        {
          record: dnaRecord(),
          tabId: 'tab-main',
          traceFiles: [],
          selectedLibraryMemberIds: [],
        },
        gelPorts(async (snapshot) => {
          hybridSnapshots.push(snapshot)
          return false
        }),
      )
      return null
    }

    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openAgaroseGelWindow()
      await Promise.resolve()
    })
    expect(hybridSnapshots).toHaveLength(1)
    expect(hybridSnapshots[0]!.currentTabId).toBe('tab-main')
    expect(controller!.agaroseGelOpen).toBe(true)
    expect(controller!.agaroseGelSnapshot?.currentRecord.name).toBe('pUC19')
  })

  it('prefers hybrid window and skips in-app snapshot when focus succeeds', async () => {
    let controller: ReturnType<typeof useAgaroseGelDialogController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useAgaroseGelDialogController(
        {
          record: dnaRecord(),
          tabId: 'tab-main',
          traceFiles: [],
          selectedLibraryMemberIds: [],
        },
        gelPorts(async () => true),
      )
      return null
    }

    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openAgaroseGelWindow()
      await Promise.resolve()
    })
    expect(controller!.agaroseGelOpen).toBe(false)
    expect(controller!.agaroseGelSnapshot).toBeNull()
  })

  it('clears retained snapshot on close', async () => {
    let controller: ReturnType<typeof useAgaroseGelDialogController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useAgaroseGelDialogController(
        {
          record: dnaRecord(),
          tabId: 'tab-main',
          traceFiles: [],
          selectedLibraryMemberIds: [],
        },
        gelPorts(async () => false),
      )
      return null
    }

    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openAgaroseGelWindow()
      await Promise.resolve()
    })
    act(() => { controller!.closeAgaroseGel() })
    expect(controller!.agaroseGelOpen).toBe(false)
    expect(controller!.agaroseGelSnapshot).toBeNull()
  })

  it('invokes hybrid adapter before applying in-app fallback state', async () => {
    const order: string[] = []
    let controller: ReturnType<typeof useAgaroseGelDialogController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useAgaroseGelDialogController(
        {
          record: dnaRecord(),
          tabId: 'tab-main',
          traceFiles: [],
          selectedLibraryMemberIds: [],
        },
        gelPorts(async () => {
          order.push('hybrid')
          return false
        }),
      )
      return null
    }

    act(() => { root!.render(<Harness />) })
    await act(async () => {
      controller!.openAgaroseGelWindow()
      await Promise.resolve()
    })
    order.push(controller!.agaroseGelOpen ? 'in-app-open' : 'in-app-closed')
    expect(order).toEqual(['hybrid', 'in-app-open'])
  })
})
