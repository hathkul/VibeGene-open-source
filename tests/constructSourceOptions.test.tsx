// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConstructSourceSelect } from '../src/cloning/ConstructSourceOptions'
import {
  groupConstructSourceOptions,
  type ConstructSourceGroups,
  type ConstructSourceOption,
} from '../src/cloning/useConstructSources'
import type { SequenceRecord } from '../src/domain/types'
import { defaultConstructProperties } from '../src/domain/constructProperties'

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

function record(id: string, name: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
}

function render(element: ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(element))
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('construct source select', () => {
  it('uses stable alphabetical order instead of open-window heartbeat order', () => {
    const options: ConstructSourceOption[] = [
      {
        kind: 'open-tab',
        label: 'Library 10',
        tabId: 'newest-heartbeat',
        record: record('ten', 'Library 10'),
      },
      {
        kind: 'open-tab',
        label: 'Library 2',
        tabId: 'older-heartbeat',
        record: record('two', 'Library 2'),
      },
    ]

    expect(groupConstructSourceOptions(options).open.map((option) => option.label)).toEqual([
      'Library 2',
      'Library 10',
    ])
    expect(groupConstructSourceOptions([...options].reverse()).open.map((option) => option.label)).toEqual([
      'Library 2',
      'Library 10',
    ])
  })

  it('keeps options stable while the native menu is open and refreshes after blur', () => {
    const refresh = vi.fn()
    const groups: ConstructSourceGroups = {
      current: [{ kind: 'current', label: 'Vector', record: record('vector', 'Vector') }],
      open: [
        {
          kind: 'open-tab',
          label: 'Library',
          tabId: 'library-window',
          record: record('library', 'Library'),
        },
      ],
      recent: [],
      drafts: [],
    }
    render(<ConstructSourceSelect groups={groups} onOpen={refresh} />)

    const select = container!.querySelector('select')!
    act(() => {
      select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      select.focus()
    })
    expect(refresh).not.toHaveBeenCalled()

    act(() => select.blur())
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
