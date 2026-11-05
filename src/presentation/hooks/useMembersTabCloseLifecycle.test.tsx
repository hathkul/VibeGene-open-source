// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMembersTabCloseLifecycle } from './useMembersTabCloseLifecycle'

describe('useMembersTabCloseLifecycle', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('resets Members UI when leaving the Members tab', () => {
    const setMembersAddMenuOpen = vi.fn()
    const setEditingMemberNameId = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let activeTab: 'Members' | 'Sequence' = 'Members'
    function Harness() {
      useMembersTabCloseLifecycle({
        activeTab,
        setMembersAddMenuOpen,
        setEditingMemberNameId,
      })
      return null
    }
    act(() => { root!.render(<Harness />) })
    expect(setMembersAddMenuOpen).not.toHaveBeenCalled()

    act(() => {
      activeTab = 'Sequence'
      root!.render(<Harness />)
    })
    expect(setMembersAddMenuOpen).toHaveBeenCalledWith(false)
    expect(setEditingMemberNameId).toHaveBeenCalledWith(null)
  })
})
