// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseFolderPickerTree } from './DatabaseFolderPickerTree'
import { readDatabaseExpandedFolderIds } from './storage/databaseUiPrefs'
import type { StoredFolder } from './storage/projectLibrary'

describe('DatabaseFolderPickerTree reveal persistence', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    localStorage.clear()
  })

  it('keeps a revealed nested branch expanded after reveal is cleared', () => {
    const folders: StoredFolder[] = [
      { id: 'root', name: 'Root', parentId: null, updatedAt: '' },
      { id: 'child', name: 'Child', parentId: 'root', updatedAt: '' },
      { id: 'leaf', name: 'Leaf', parentId: 'child', updatedAt: '' },
    ]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const props = {
      folders,
      selectedId: 'root-option',
      onSelect: () => undefined,
      rootOption: { id: 'root-option', label: 'Unfiled' },
      showSelectionLabel: false,
    }
    act(() => root.render(<DatabaseFolderPickerTree {...props} revealFolderId="leaf" />))
    expect(host.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(2)
    act(() => root.render(<DatabaseFolderPickerTree {...props} revealFolderId={null} />))
    expect(host.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(2)
    act(() => (host.querySelector('button[aria-label="Collapse Root"]') as HTMLButtonElement).click())
    expect(host.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(0)
    expect(readDatabaseExpandedFolderIds().has('root')).toBe(false)
  })

  it('reveals and persists a target when folder topology arrives after the reveal', () => {
    const folders: StoredFolder[] = [
      { id: 'root', name: 'Root', parentId: null, updatedAt: '' },
      { id: 'child', name: 'Child', parentId: 'root', updatedAt: '' },
      { id: 'leaf', name: 'Leaf', parentId: 'child', updatedAt: '' },
    ]
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const props = {
      selectedId: 'root-option',
      onSelect: () => undefined,
      rootOption: { id: 'root-option', label: 'Unfiled' },
      showSelectionLabel: false,
      revealFolderId: 'leaf',
    }
    act(() => root.render(<DatabaseFolderPickerTree {...props} folders={[]} />))
    act(() => root.render(<DatabaseFolderPickerTree {...props} folders={folders} />))
    expect(host.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(2)
    const persisted = readDatabaseExpandedFolderIds()
    expect(persisted.has('root')).toBe(true)
    expect(persisted.has('child')).toBe(true)
    expect(persisted.has('leaf')).toBe(true)
  })
})
