// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { cloneFixture } from './domain/fixtures'
import type { SequenceRecord } from './domain/types'
import { createDocumentBrowserHandoffAdapters } from './documentBrowserHandoff'

vi.mock('./storage/projects', () => ({
  putHandoffRecord: vi.fn(async () => {}),
}))

vi.mock('./storage/libraryEvents', () => ({
  writeHandoffFolderId: vi.fn(),
  writeHandoffDocumentOrigin: vi.fn(),
}))

vi.mock('./crossTab/windowHandoff', () => ({
  prepareWindowHandoffSender: vi.fn(),
}))

const record = (): SequenceRecord => ({
  ...cloneFixture(),
  id: 'record-1',
  name: 'Demo',
  molecule: 'dna',
  topology: 'linear',
  sequence: 'ACGT',
  features: [],
  primers: [],
})

describe('createDocumentBrowserHandoffAdapters', () => {
  it('navigates a previously reserved tab after preparing a record', () => {
    const adapters = createDocumentBrowserHandoffAdapters({ setStatus: vi.fn(), getActiveLibraryFolderId: () => null, canReuseCurrentTab: () => true })
    const reserved = { closed: false, location: { href: 'about:blank' }, opener: null, blur: vi.fn(), postMessage: vi.fn() } as unknown as Window
    const open = vi.spyOn(window, 'open')
    expect(adapters.openBrowserHandoff('reserved-test', record(), null, { title: 'Demo', activate: true, initiallyUnsaved: true, reservedTab: reserved })).toBe(true)
    expect(reserved.location.href).toContain('history=reserved-test')
    expect(reserved.location.href).toContain('unsaved=1')
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('reports failure if the reserved tab was closed before preparation finished', () => {
    const adapters = createDocumentBrowserHandoffAdapters({ setStatus: vi.fn(), getActiveLibraryFolderId: () => null, canReuseCurrentTab: () => false })
    const reserved = { closed: true } as Window
    expect(adapters.openBrowserHandoff('closed-test', record(), null, { title: 'Demo', activate: true, initiallyUnsaved: true, reservedTab: reserved })).toBe(false)
  })

  it('resolves undefined native folder ids to the active library folder', async () => {
    const { writeHandoffFolderId } = await import('./storage/libraryEvents')
    const { putHandoffRecord } = await import('./storage/projects')
    vi.mocked(writeHandoffFolderId).mockClear()
    vi.mocked(putHandoffRecord).mockClear()
    const adapters = createDocumentBrowserHandoffAdapters({
      setStatus: vi.fn(),
      getActiveLibraryFolderId: () => 'folder-live',
      canReuseCurrentTab: () => false,
    })

    await expect(adapters.storeHandoffRecord(record(), undefined)).resolves.toEqual(expect.stringMatching(/^hist/))
    expect(vi.mocked(putHandoffRecord).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(writeHandoffFolderId).mock.invocationCallOrder[0]!,
    )
    expect(writeHandoffFolderId).toHaveBeenCalledWith(expect.stringMatching(/^hist/), 'folder-live')
  })
})
