// @vitest-environment jsdom
import { act, createRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseManagerMainSection } from './DatabaseManagerMainSection'

vi.mock('./DatabaseManagerToolbarRegion', () => ({ DatabaseManagerToolbarRegion: ({ searchControl }: { searchControl: ReactNode }) => <div className="db-main-toolbar">{searchControl}</div> }))
vi.mock('./DatabaseManagerRecordsRegion', () => ({ DatabaseManagerRecordsRegion: () => null }))

afterEach(() => { document.body.replaceChildren() })

it('edits the search and switches between current and global scope', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Example() {
    const [value, setValue] = useState('')
    const [scope, setScope] = useState<'current' | 'global'>('current')
    return <DatabaseManagerMainSection toolbar={{} as never} records={{} as never} recordsFileListRef={createRef()} search={{ value, scope, onChange: setValue, onScopeChange: setScope }} />
  }
  await act(async () => root.render(<Example />))
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
  const select = host.querySelector<HTMLSelectElement>('select')!
  expect(input.closest('.db-main-toolbar')).not.toBeNull()
  expect(select.closest('.db-main-toolbar')).not.toBeNull()
  expect(select.value).toBe('current')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'RAP')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    select.value = 'global'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(input.value).toBe('RAP')
  expect(select.value).toBe('global')
  await act(async () => root.unmount())
})
