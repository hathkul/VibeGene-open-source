import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceTabSelectHandler } from './workspaceTabBarCommands'

describe('createWorkspaceTabSelectHandler', () => {
  it('calls setActiveTab before setMobileSearchOpen(false)', () => {
    const order: string[] = []
    const setActiveTab = vi.fn((tab: string) => {
      order.push(`tab:${tab}`)
    })
    const setMobileSearchOpen = vi.fn((open: boolean | ((open: boolean) => boolean)) => {
      const resolved = typeof open === 'function' ? open(true) : open
      order.push(`search:${String(resolved)}`)
    })
    const onSelectTab = createWorkspaceTabSelectHandler({ setActiveTab, setMobileSearchOpen })
    onSelectTab('History')
    expect(setActiveTab).toHaveBeenCalledWith('History')
    expect(setMobileSearchOpen).toHaveBeenCalledWith(false)
    expect(order).toEqual(['tab:History', 'search:false'])
  })
})
