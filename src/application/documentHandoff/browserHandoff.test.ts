import { describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import { databaseWorkspaceDocumentOrigin } from '../../domain/workspaceDocumentOrigin'
import {
  HISTORY_HANDOFF_PREFIX,
  openBrowserHandoffTab,
  resolveNativeHandoffFolderId,
  scheduleInactiveTabFocus,
  storeHandoffRecordForNativeOpen,
  type BrowserHandoffPorts,
  type HandoffRecordStorePorts,
} from './browserHandoff'

const record = (overrides: Partial<SequenceRecord> = {}): SequenceRecord => ({
  id: 'record-1',
  name: 'Demo',
  molecule: 'dna',
  topology: 'linear',
  sequence: 'ACGT',
  features: [],
  primers: [],
  ...overrides,
} as SequenceRecord)

function browserPorts(overrides: Partial<BrowserHandoffPorts> = {}): BrowserHandoffPorts {
  return {
    pathname: '/workspace',
    setLocalStorageItem: vi.fn(() => true),
    removeLocalStorageItem: vi.fn(),
    writeFolderId: vi.fn(),
    writeDocumentOrigin: vi.fn(),
    openTab: vi.fn(() => ({ closed: false, blur: vi.fn(), opener: null, postMessage: vi.fn() })),
    detachOpener: vi.fn(),
    blurTab: vi.fn(),
    focusSelf: vi.fn(),
    schedule: vi.fn((callback) => callback()),
    persistHandoff: vi.fn(async () => {}),
    prepareTransfer: vi.fn(() => ({
      setTarget: vi.fn(),
      stop: vi.fn(),
    })),
    reportTransferFailure: vi.fn(),
    ...overrides,
  }
}

describe('browserHandoff', () => {
  it('opens a compact handoff without cross-tab transfer', () => {
    const ports = browserPorts()
    const opened = openBrowserHandoffTab(ports, 'hist-1', record(), 'folder-1', {
      title: 'Demo',
      activate: true,
      initiallyUnsaved: false,
    })
    expect(opened).toBe(true)
    expect(ports.prepareTransfer).not.toHaveBeenCalled()
    expect(ports.openTab).toHaveBeenCalledWith('/workspace?history=hist-1&bootSplash=0')
    expect(ports.persistHandoff).toHaveBeenCalledWith('hist-1', expect.any(Object))
  })

  it('reuses an untouched placeholder tab after persisting the handoff', async () => {
    const navigateCurrentTab = vi.fn()
    const ports = browserPorts({
      canReuseCurrentTab: vi.fn(() => true),
      navigateCurrentTab,
    })
    expect(openBrowserHandoffTab(ports, 'hist-reuse', record(), 'folder-1', {
      title: 'Demo',
      activate: true,
      initiallyUnsaved: false,
    })).toBe(true)
    expect(ports.openTab).not.toHaveBeenCalled()
    expect(navigateCurrentTab).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(navigateCurrentTab).toHaveBeenCalledWith('/workspace?history=hist-reuse&bootSplash=0')
  })

  it('carries Save to Database intent into the destination workspace', () => {
    const ports = browserPorts()
    expect(openBrowserHandoffTab(ports, 'hist-save', record(), undefined, {
      title: 'Imported sequence',
      activate: true,
      initiallyUnsaved: true,
      openSaveToDatabase: true,
    })).toBe(true)
    expect(ports.openTab).toHaveBeenCalledWith(
      '/workspace?history=hist-save&bootSplash=0&unsaved=1&saveToDatabase=1',
    )
  })

  it('uses cross-tab transfer and clears localStorage when popup open fails', () => {
    const transfer = { setTarget: vi.fn(), stop: vi.fn() }
    const ports = browserPorts({
      setLocalStorageItem: vi.fn(() => false),
      prepareTransfer: vi.fn(() => transfer),
      openTab: vi.fn(() => null),
    })
    expect(openBrowserHandoffTab(ports, 'hist-2', record({ snapGeneNativeHistory: { nodePackets: [] } as never }), null, {
      title: 'Demo',
      activate: false,
      initiallyUnsaved: true,
    })).toBe(false)
    expect(transfer.stop).toHaveBeenCalled()
    expect(ports.removeLocalStorageItem).toHaveBeenCalledWith(`${HISTORY_HANDOFF_PREFIX}hist-2`)
  })

  it('reports IndexedDB transfer failures unless suppressed', async () => {
    const ports = browserPorts({
      persistHandoff: vi.fn(async () => {
        throw new Error('quota')
      }),
    })
    openBrowserHandoffTab(ports, 'hist-3', record(), null, {
      title: 'Demo',
      activate: true,
      initiallyUnsaved: false,
    })
    await Promise.resolve()
    expect(ports.reportTransferFailure).toHaveBeenCalledWith(
      'Could not transfer the construct to the new tab: quota',
    )
  })

  it('restores parent focus when the new tab should stay in the background', () => {
    const tab = { blur: vi.fn(), closed: false, opener: null, postMessage: vi.fn() }
    const blurTab = vi.fn()
    const focusSelf = vi.fn()
    const schedule = vi.fn((callback: () => void, delayMs: number) => {
      if (delayMs === 50) callback()
    })
    scheduleInactiveTabFocus({ blurTab, focusSelf, schedule }, tab, false)
    expect(blurTab).toHaveBeenCalledWith(tab)
    expect(focusSelf).toHaveBeenCalled()
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 0)
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 50)
  })

  it('stores native handoff keys and folder ids', async () => {
    const ports: HandoffRecordStorePorts = {
      createKey: () => 'hist-native',
      putHandoff: vi.fn(async () => {}),
      setLocalStorageItem: vi.fn(() => true),
      writeFolderId: vi.fn(),
    }
    await expect(storeHandoffRecordForNativeOpen(ports, record(), 'folder-9')).resolves.toBe('hist-native')
    expect(ports.putHandoff).toHaveBeenCalledWith('hist-native', expect.any(Object))
    expect(ports.writeFolderId).toHaveBeenCalledWith('hist-native', 'folder-9')
  })

  it('persists an explicit database origin with a handoff', async () => {
    const origin = databaseWorkspaceDocumentOrigin('project-9', null)
    const ports = browserPorts()
    openBrowserHandoffTab(ports, 'hist-origin', record(), null, {
      title: 'Demo',
      activate: true,
      initiallyUnsaved: false,
      documentOrigin: origin,
    })
    expect(ports.writeDocumentOrigin).toHaveBeenCalledWith('hist-origin', origin)
    expect(ports.persistHandoff).toHaveBeenCalledWith('hist-origin', expect.any(Object), origin)
  })

  it('inherits the active library folder when native folderId is undefined', async () => {
    expect(resolveNativeHandoffFolderId(undefined, 'folder-active')).toBe('folder-active')
    expect(resolveNativeHandoffFolderId(null, 'folder-active')).toBeNull()

    const putHandoff = vi.fn(async () => {})
    const writeFolderId = vi.fn()
    const ports: HandoffRecordStorePorts = {
      createKey: () => 'hist-draft',
      putHandoff,
      setLocalStorageItem: vi.fn(() => true),
      writeFolderId,
    }
    const resolved = resolveNativeHandoffFolderId(undefined, 'folder-active')
    await storeHandoffRecordForNativeOpen(ports, record(), resolved)
    expect(putHandoff.mock.invocationCallOrder[0]).toBeLessThan(writeFolderId.mock.invocationCallOrder[0]!)
    expect(writeFolderId).toHaveBeenCalledWith('hist-draft', 'folder-active')
  })
})
