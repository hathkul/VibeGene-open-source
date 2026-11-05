// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useSelectionStatusAttention } from './useSelectionStatusAttention'

type HarnessHandles = {
  setStatus: (message: string) => void
  snapshot: () => { attentionKey: number; history: string[] }
}

function setup(initialStatus = 'Loaded fixture.') {
  const handles: HarnessHandles = {
    setStatus: () => {},
    snapshot: () => ({ attentionKey: -1, history: [] }),
  }

  function Harness() {
    const [status, setStatus] = useState(initialStatus)
    const { statusAttentionKey, statusHistory } = useSelectionStatusAttention(status)
    handles.setStatus = setStatus
    handles.snapshot = () => ({ attentionKey: statusAttentionKey, history: statusHistory })
    return null
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => root.render(<Harness />))
  return { handles, host, root }
}

const roots: Root[] = []
const hosts: HTMLElement[] = []

afterEach(() => {
  while (roots.length) act(() => roots.pop()!.unmount())
  while (hosts.length) hosts.pop()!.remove()
})

function mount(initialStatus?: string) {
  const mounted = setup(initialStatus)
  roots.push(mounted.root)
  hosts.push(mounted.host)
  return mounted.handles
}

describe('useSelectionStatusAttention', () => {
  it('skips the initial status: no attention bump and no history entry', () => {
    const handles = mount('Loaded fixture.')
    expect(handles.snapshot().attentionKey).toBe(0)
    expect(handles.snapshot().history).toEqual([])
  })

  it('bumps the attention key and appends to history on a new status', () => {
    const handles = mount()
    act(() => handles.setStatus('Saved.'))
    expect(handles.snapshot().attentionKey).toBe(1)
    expect(handles.snapshot().history).toHaveLength(1)
    expect(handles.snapshot().history[0]).toContain('Saved.')
  })

  it('keeps the initial skip behavior when the first effect runs with a boot error status', () => {
    const handles = mount('Could not open file: missing')
    expect(handles.snapshot().attentionKey).toBe(0)
    expect(handles.snapshot().history).toEqual([])
    act(() => handles.setStatus('Opened plasmid.'))
    expect(handles.snapshot().attentionKey).toBe(1)
    expect(handles.snapshot().history).toHaveLength(1)
  })

  it('ignores blank statuses', () => {
    const handles = mount()
    act(() => handles.setStatus('   '))
    expect(handles.snapshot().attentionKey).toBe(0)
    expect(handles.snapshot().history).toEqual([])
  })

  it('ignores selection-bar echo statuses already shown on the left of the bar', () => {
    const handles = mount()
    act(() => handles.setStatus('Selected 10..30 (21 bp)'))
    act(() => handles.setStatus('Caret at position 42'))
    expect(handles.snapshot().attentionKey).toBe(0)
    expect(handles.snapshot().history).toEqual([])
  })

  it('orders history oldest-first as new statuses arrive', () => {
    const handles = mount()
    act(() => handles.setStatus('First.'))
    act(() => handles.setStatus('Second.'))
    act(() => handles.setStatus('Third.'))
    const { history } = handles.snapshot()
    expect(history).toHaveLength(3)
    expect(history[0]).toContain('First.')
    expect(history[1]).toContain('Second.')
    expect(history[2]).toContain('Third.')
  })

  it('trims messages recorded in history', () => {
    const handles = mount()
    act(() => handles.setStatus('  Saved.  '))
    expect(handles.snapshot().history[0]).toContain('  Saved.')
    expect(handles.snapshot().history[0]).not.toContain('  Saved.  ')
  })

  it('keeps advancing the attention key after history reaches its cap', () => {
    const handles = mount()
    for (let index = 1; index <= 45; index += 1) {
      act(() => handles.setStatus(`Status ${index}.`))
    }
    expect(handles.snapshot().history).toHaveLength(40)
    expect(handles.snapshot().attentionKey).toBe(45)
    expect(handles.snapshot().history[0]).toContain('Status 6.')
    expect(handles.snapshot().history[39]).toContain('Status 45.')
  })
})
